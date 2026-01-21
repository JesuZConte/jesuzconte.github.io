We're in a discovery to make the instrumentation for a Cloud run. So I've got this very useful guide which I am documenting here. 

But the first question is, what is a sidecar?
A sidecar is a helper container that runs alongside your main application container. 
Think of it like a motorcycle sidecar: it’s attached to your main vehicle and helps with specific tasks.

In Simple Terms:
The main application container does the business logic (handles requests, processes data, etc.).
The sidecar container handles supporting tasks (logging, monitoring, security, etc.).

## Why Use a Sidecar?

A sidecar provides several advantages:

1. **Centralized Processing**: All telemetry data (traces, logs, metrics) is processed in one place
2. **Reduced Load**: The main service doesn't need to handle telemetry processing
3. **Data Enrichment**: Add metadata, filter sensitive data, transform data before sending
4. **Multiple Backends**: Easily send data to multiple destinations (GCP, other OTLP endpoints, etc.)
5. **Independent Scaling**: The sidecar can be scaled independently if needed

In our case, we need the sidecar to be the OpenTelemetry collector, both containers will run in the same Cloud Run instance and will share the same network (they can talk via localhost), and they share files/memory.

---
## Step 1: Adding OpenTelemetry Java Agent

The OpenTelemetry Java agent automatically instruments your Java application to collect traces, metrics, and logs without code changes.

### 1.1 Update Dockerfile

Add the OpenTelemetry Java agent to your Dockerfile:

```dockerfile
# Dockerfile
# Stage 1: Build the application
FROM maven:3.8.3-openjdk-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

# Stage 2: Run the application with the OTel agent
# Use a smaller, JRE-only base image for the final image
FROM openjdk:17-jre-slim

# Create a directory for the agent and download the agent JAR
WORKDIR /app
RUN mkdir -p /agent
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar /agent/opentelemetry-javaagent.jar

# Copy the application JAR from the build stage
COPY --from=build /app/target/*.jar app.jar

# Command to run the application, attaching the Java agent
ENTRYPOINT ["java", "-javaagent:/agent/opentelemetry-javaagent.jar", "-jar", "app.jar"]

```
The setup for the java agent I've put here is really a simplification. In my case, I got a lot of trouble downloading the java agent and then verifying it was available.
I might create another post talking about it!

### 1.3 Key Points About Java Agent

- **Automatic Instrumentation**: The agent automatically instruments common libraries (Spring Boot, HTTP clients, JDBC, etc.)
- **No Code Changes**: Works with existing code without modifications
- **Configuration via Environment Variables**: All settings are controlled via `OTEL_*` environment variables
- **Low Overhead**: Minimal performance impact when properly configured

---

## Step 2: Create OpenTelemetry Collector Configuration

Create the configuration file for the sidecar collector:

**File: `deploy/run/otel-collector-config.yaml`**

```yaml
receivers:
  # OTLP receiver for traces, metrics, and logs
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317 # Standard OTLP gRPC port
      http:
        endpoint: 0.0.0.0:4318 # Standard OTLP HTTP port

  # File log receiver (optional - if you want to collect log files)
  filelog:
    include:
      - /var/log/app/*.log

processors:
  # Batch processor for efficient sending
  batch:
    timeout: 10s
    send_batch_size: 1024
  
  # Resource processor to enrich with environment metadata
  resource:
    attributes:
      - key: deployment.environment
        value: ${ENVIRONMENT}
        from_env: ENVIRONMENT
      - key: service.name
        value: ${SERVICE_NAME}
        from_env: SERVICE_NAME
      - key: service.version
        value: ${SERVICE_VERSION}
        from_env: SERVICE_VERSION

  # Attributes processor to filter sensitive data
  attributes:
    actions:
      - key: authorization
        action: delete
      - key: password
        action: delete
      - key: token
        action: delete

exporters:
  # Google Cloud exporter for traces, metrics, and logs
  googlecloud:
    project: ${GCP_PROJECT_ID}
    trace:
      use_insecure: false
    log:
      default_log_name: ${SERVICE_NAME}
  
  # Optional: Send to additional OTLP backends
  # otlp/endpoint:
  #   endpoint: https://your-otel-backend:4317
  #   tls:
  #     insecure: false
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resource, attributes, batch]
      exporters: [googlecloud]
    
    logs:
      receivers: [filelog, otlp]
      processors: [resource, attributes, batch]
      exporters: [googlecloud]
    
    metrics:
      receivers: [otlp]
      processors: [resource, batch]
      exporters: [googlecloud]
  
  # Health check endpoint
  extensions: [health_check]
  telemetry:
    logs:
      level: info
```

---

## Step 3: Create Sidecar Configuration Template

Create a template file to define the sidecar configuration:

**File: `deploy/run/sidecar-config.yaml.erb`**

```yaml
# Sidecar configuration template for Cloud Run
# This file defines the OpenTelemetry Collector sidecar configuration
# It will be processed by the pipeline to generate the complete service YAML

# Note: Cloud Run requires sidecar definition in the Knative Service YAML (Knative is the open-source platform that Cloud Run uses. Cloud Run is Google’s managed version of Knative.
)
# The pipeline must process this and generate the complete YAML with both containers
```
What you need to do
Your GitLab pipeline must:
1. Read your .erb templates
2. Process them (fill in variables like <%= environment %>)
3. Generate the final Knative Service YAML with both containers defined
4. Deploy that YAML to Cloud Run

---

## Step 4: Modify runtime-config.yaml.erb to Include Sidecar

Update `runtime-config.yaml.erb` to include sidecar configuration:

**File: `deploy/run/runtime-config.yaml.erb`**

```yaml
region: us-east1
cpu: 2
memory: 1536Mi  # Increased to accommodate sidecar
min-instances: 1
max-instances: 5
cpu-throttling: false   
execution-environment: gen2
ingress: all
concurrency: 5
timeout: 600
allow-unauthenticated: ~
service-account: "your-service-sa@iam.gserviceaccount.com"

# Sidecar configuration (OpenTelemetry Collector)
# Note: Cloud Run requires this to be defined in the Knative Service YAML
# The pipeline must process this and generate the complete YAML with both containers

sidecar:
  name: otel-collector
  image: gcr.io/opentelemetry-operator/opentelemetry-collector:latest
  # Or use a specific image from your organization:
  # image: us-docker.pkg.dev/<%= project_id %>/observability/otel-collector:latest
  env:
    - name: ENVIRONMENT
      value: "<%= environment %>"
    - name: SERVICE_NAME
      value: "<%= service_name %>"
    - name: SERVICE_VERSION
      value: "${IMAGE_ID}"
    - name: GCP_PROJECT_ID
      value: "<%= project_id %>"
  ports:
    - containerPort: 4317  # OTLP gRPC
    - containerPort: 4318   # OTLP HTTP
    - containerPort: 8888   # Health check
  resources:
    cpu: 500m
    memory: 256Mi
  volumeMounts:
    - name: otel-config
      mountPath: /etc/otelcol
    - name: shared-logs
      mountPath: /var/log/app
  startupProbe:
    httpGet:
      path: /
      port: 8888  # Health check endpoint of the collector
    initialDelaySeconds: 5
    periodSeconds: 10

volumes:
  - name: otel-config
    configMap:
      name: otel-collector-config
  - name: shared-logs
    emptyDir: {}  # Shared in-memory volume for logs
```

---
## Step 5: Modify environment.yaml.erb to Send to Sidecar

Update environment variables so the main service sends telemetry to the sidecar instead of directly to GCP:

**File: `deploy/run/environment.yaml.erb`**

```yaml
...

# OpenTelemetry - Now send to local sidecar instead of directly to GCP
OTEL_SERVICE_NAME: "<%= service_name %>"
OTEL_SERVICE_VERSION: "${IMAGE_ID}"

# Change: Instead of sending directly to GCP, send to local sidecar
OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318"  # Sidecar OTLP HTTP endpoint
OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf"
OTEL_EXPORTER_GOOGLE_CLOUD_TRACE_ENABLED: "false"  # No longer sending directly

# The sidecar will handle sending to GCP
OTEL_JAVAAGENT_LOGGING: "none"
OTEL_METRICS_EXPORTER: "otlp"  # Changed from "none" to "otlp"
OTEL_LOGS_EXPORTER: "otlp"     # Changed from "none" to "otlp"
OTEL_TRACES_EXPORTER: "otlp"   # Changed from "google_cloud_trace" to "otlp"

OTEL_TRACES_SAMPLER: "traceidratio"

<% if environment == 'prod' %>
OTEL_TRACES_SAMPLER_ARG: "0.1"
TRACING_SAMPLING_PROBABILITY: "0.1"
<% elsif environment == 'intg' %>
OTEL_TRACES_SAMPLER_ARG: "0.5"
TRACING_SAMPLING_PROBABILITY: "0.5"
<% else %>
OTEL_TRACES_SAMPLER_ARG: "1.0"
TRACING_SAMPLING_PROBABILITY: "1.0"
<% end %>

OTEL_RESOURCE_ATTRIBUTES: "service.name=,service.version=,deployment.environment="
OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELD_NAMES: ".*authorization.*,.*cookie.*"
OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST: ".*"
OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_RESPONSE: ".*"
```

### Key Environment Variable Changes:

| Variable | Before | After | Reason |
|----------|--------|-------|--------|
| `OTEL_TRACES_EXPORTER` | `google_cloud_trace` | `otlp` | Send to sidecar via OTLP |
| `OTEL_METRICS_EXPORTER` | `none` | `otlp` | Enable metrics export |
| `OTEL_LOGS_EXPORTER` | `none` | `otlp` | Enable logs export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (not set) | `http://localhost:4318` | Point to sidecar |
| `OTEL_EXPORTER_GOOGLE_CLOUD_TRACE_ENABLED` | `true` | `false` | Sidecar handles GCP export |

---

## Step 6: Verify GitLab Pipeline

Check how the pipeline processes these files. You'll likely need to:

1. **Create a ConfigMap** with the collector configuration
2. **Generate the Cloud Run YAML** with both containers
3. **Ensure the sidecar starts before the main service** (using container dependencies)

### Example of Generated YAML

The final generated YAML should look like this:

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: <%= service_name %>
  annotations:
    run.googleapis.com/container-dependencies: '{"otel-collector":["app"]}'
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/execution-environment: gen2
    spec:
      containers:
      # Main container (your application)
      - name: app
        image: <%= image_url %>
        ports:
        - containerPort: 8080
        env:
        # ... variables from environment.yaml.erb ...
        startupProbe:
          httpGet:
            path: /actuator/health
            port: 8080
        
      # Sidecar (OpenTelemetry Collector)
      - name: otel-collector
        image: gcr.io/opentelemetry-operator/opentelemetry-collector:latest
        env:
        - name: ENVIRONMENT
          value: "development"
        - name: SERVICE_NAME
          value: "my_service"
        - name: SERVICE_VERSION
          value: "v1.0.0"
        - name: GCP_PROJECT_ID
          value: "my_gcp_project"
        ports:
        - containerPort: 4317
        - containerPort: 4318
        - containerPort: 8888
        resources:
          limits:
            cpu: 500m
            memory: 256Mi
        volumeMounts:
        - name: otel-config
          mountPath: /etc/otelcol
        - name: shared-logs
          mountPath: /var/log/app
        startupProbe:
          httpGet:
            path: /
            port: 8888
          initialDelaySeconds: 5
          periodSeconds: 10
      
      volumes:
      - name: otel-config
        configMap:
          name: otel-collector-config-development
      - name: shared-logs
        emptyDir: {}
```

### Container Dependencies

The annotation `run.googleapis.com/container-dependencies: '{"otel-collector":["app"]}'` ensures:
- The `otel-collector` sidecar must start and be healthy before the `app` container starts
- This prevents the main service from starting before the collector is ready to receive telemetry

---

## Step 7: Create Collector ConfigMap

Before deployment, create the ConfigMap with the collector configuration. This should be done in the pipeline before deployment:

### Option 1: Using kubectl (if you have cluster access)

```bash
# This should be done in the pipeline before deploy
kubectl create configmap otel-collector-config-<environment> \
  --from-file=config.yaml=deploy/run/otel-collector-config.yaml \
  --namespace=<namespace> \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Option 2: Using gcloud (Cloud Run native)

```bash
# Create ConfigMap in GCP
gcloud run services update <service-name> \
  --update-config-maps=otel-config=/path/to/otel-collector-config.yaml \
  --region=us-east1 \
  --project=<project-id>
```

---

## Step 8: Adjust Resources

Increase memory/CPU allocation to accommodate the sidecar:

**Updated `runtime-config.yaml.erb`:**

```yaml
memory: 1536Mi  # Increased from 1024Mi to include sidecar overhead
cpu: 2          # May need to increase if sidecar requires more CPU
```

### Resource Allocation Strategy

- **Main Container**: Allocates most resources (CPU: 1.5 cores, Memory: 1280Mi)
- **Sidecar Container**: Minimal resources (CPU: 500m, Memory: 256Mi)
- **Total**: CPU: 2 cores, Memory: 1536Mi

---

## Summary of Changes

### Files to Create:
1. ✅ `deploy/run/otel-collector-config.yaml` - Collector configuration
2. ✅ `deploy/run/sidecar-config.yaml.erb` - Sidecar template (optional)

### Files to Modify:
1. ✅ `deploy/run/runtime-config.yaml.erb` - Add sidecar configuration
2. ✅ `deploy/run/environment.yaml.erb` - Change OTEL endpoints to point to sidecar
3. ✅ `Dockerfile` - Ensure Java agent is properly configured (already done)
4. ✅ `start.sh` - Verify agent startup (already done)
---
## References

### Official Documentation
1. **Custom Metrics OpenTelemetry Sidecar**
   - https://docs.cloud.google.com/run/docs/tutorials/custom-metrics-opentelemetry-sidecar

2. **Configuring Containers in Cloud Run**
   - https://docs.cloud.google.com/run/docs/configuring/services/containers

3. **Cloud Run Container Contract**
   - https://cloud.google.com/run/docs/container-contract

4. **OpenTelemetry Collector Configuration Documentation**
   - https://opentelemetry.io/docs/collector/configuration/

5. **OpenTelemetry Java Instrumentation**
   - https://opentelemetry.io/docs/instrumentation/java/automatic/

6. **OpenTelemetry Collector GitHub**
   - https://github.com/open-telemetry/opentelemetry-collector

7. **Google Cloud Exporter**
   - https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/googlecloudexporter
