---
layout: post
title: "Spring Bean Lifecycle and Scopes: Managing Object State and Horizons"
date: 2026-07-12
categories: [Spring-Boot, Architecture]
tags: [java, spring-framework, beans, concurrency, system-design]
---

In the Spring ecosystem, objects managed by the IoC container are known as **Beans**. Unlike standard Java objects that live and die strictly based on manual instantiation and JVM Garbage Collection, Spring Beans experience a rich, fully managed lifecycle. 

Understanding how Beans are scoped and how they transition from instantiation to destruction is critical when architecting high-performance, concurrent microservices.

---

### 1. Core Bean Scopes: Singleton vs. Prototype

Before looking at the lifecycle phases, we must define **how many times** a Bean is instantiated. Spring provides two primary scopes for standard applications:

#### A. Singleton Scope (The Framework Default)
* **The Rule:** Spring creates **exactly one shared instance** of the Bean for the entire ApplicationContext.
* **Concurrency Warning:** Every time another component requests this Bean, Spring injects the exact same memory reference. Therefore, **Singleton Beans must be stateless**. If you store request-specific data in a Singleton class variable, concurrent threads will overwrite each other's data, leading to catastrophic multi-user race conditions.

#### B. Prototype Scope
* **The Rule:** Spring creates a **brand-new instance** of the Bean every single time it is requested or injected. 
* **Best Used For:** State-heavy components or non-thread-safe utilities that cannot be shared safely across concurrent threads.

---

### 2. Architectural Blueprint: The Dynamic Strategy Alternative

When dynamic behavior or mutability is required (e.g., swapping a payment processor runtime based on a user's choice), modern microservice architecture avoids mutating a Singleton Bean’s internal variables. Instead, we use the **Strategy Pattern** to dynamically resolve pre-configured, immutable Singletons via a collection wrapper:

```java
@Service
@RequiredArgsConstructor 
public class PaymentContext {

    // Spring automatically wires all beans implementing PaymentGateway into this Map
    private final Map<String, PaymentGateway> gatewayStrategies;

    public void executeTransaction(String provider, double amount) {
        // Safe, concurrent, dynamic routing without modifying any object states
        PaymentGateway strategy = gatewayStrategies.get(provider.toLowerCase());
        strategy.process(amount);
    }
}
```
### 3. The Spring Bean Lifecycle Journey
When the application boots up, every *Bean* passes through a strict chronological sequence managed by the container. We can hook into this journey using lifecycle annotations.

#### Step 1: Instantiation (The Constructor)
Spring initializes the object structure in memory. When utilizing Constructor Injection, this is the exact moment when dependencies are passed and locked using the `final` keyword.

#### Step 2: Dependency & Property Population
If your class contains any legacy setter injections or configuration injections via `@Value("${property}")`, Spring populates those variables immediately after the constructor has finished execution.

### Step 3: Initialization (`@PostConstruct`)
* **Why it matters**: Inside a standard Java constructor, you cannot safely run initialization logic that relies on your dependencies, because Spring might not have finished wiring the rest of the application context yet.

* **The Solution**: A method annotated with `@PostConstruct` runs automatically after the bean is fully instantiated and all dependencies are successfully injected. This is the absolute safest place to warm up local caches, run structural validations, or trigger client handshakes.

### Step 4: Ready for Action
The Bean enters the active pool, servicing application requests as a stable, immutable dependency.

### Step 5: Destruction (`@PreDestroy`)
* **Why it matters**: When the microservice receives a shutdown signal (such as a graceful deployment redeploy or container stop), Spring gives components a final opportunity to clean up before erasing them from memory.

* **The Solution**: Methods annotated with `@PreDestroy` execute right before the context terminates. This is where you should close database connection pools, gracefully drain active message queues, or shut down active asynchronous thread executions.

### Summary Table

| Lifecycle Milestone | Target Objective | Best Practice Annotation / Hook |
| :--- | :--- | :--- |
| **Object Allocation** | Create structure and enforce structural invariants. | Constructor (with `final` arguments) |
| **Post-Wiring Logic** | Execute runtime configurations after dependencies exist. | `@PostConstruct` |
| **Graceful Shutdown** | Release infrastructure bindings and close resources. | `@PreDestroy` |


### Technical Comparison: BeanFactory vs. ApplicationContext

| Architectural Feature | BeanFactory | ApplicationContext |
| :--- | :--- | :--- |
| **Initialization Strategy** | **Lazy Loading:** Instantiates beans only when explicitly requested via `.getBean()`. | **Eager Loading:** Instantiates all singleton beans eagerly at startup (Fail-Fast mechanism). |
| **Memory Footprint** | Extremely lightweight. Ideal for low-resource environments (IoT, mobile). | Heavier, as it pre-allocates singletons into JVM memory during bootstrap. |
| **AOP Integration** | Requires explicit, manual proxy configuration logic. | Native, seamless integration with Spring AOP and `@Aspect` annotations. |
| **Enterprise Features** | None. Purely acts as a configuration registry and dependency factory. | Supports Internationalization (i18n), Event Publication, and Web Contexts. |
| **Usage Recommendation** | Legacy/Deprecated for standard web apps. Use only in resource-constrained environments. | The absolute de facto standard for modern Enterprise Microservices and Spring Boot web apps. |

### Summary of Spring Bean Scopes

| Bean Scope | Environment | Lifecycle Horizon | Primary Enterprise Use Case |
| :--- | :--- | :--- | :--- |
| **`singleton`** | Core (Any) | One instance per IoC `ApplicationContext`. | Stateless services, repositories, and utility configurations. |
| **`prototype`** | Core (Any) | A brand-new instance every time it is requested. | State-heavy, non-thread-safe local processing components. |
| **`request`** | Web Only | One instance per individual HTTP request lifecycle. | Storing request-specific metadata (e.g., API tracing context). |
| **`session`** | Web Only | One instance per active HTTP user session. | Maintaining stateful user profiles or server-side shopping carts. |
| **`application`**| Web Only | One instance per global `ServletContext`. | Global web assets, feature toggles, or cross-context shared states. |
| **`websocket`** | Web Only | Tied strictly to the active lifecycle of a WebSocket. | Real-time chat configurations or active streaming room states. |
