## This is my first blog post... and it's about Gradle dependencies

I was assigned to update some dependencies due to vulnerabilities. I saw that in the gradle file there was a method called "resolutionStrategy" , and I was wondering why we were not just updating the libraries (as I usually do).
The reason, to be honest, was the use of AI (Cursor in particular) that, for some reason, considered that using resolutionStrategy was the way to do it. Then I asked the AI what was the reason behind, and if it was the best way.


### Mechanism Comparison
### 1. **Dependency Management (BOMs)** ⭐ **BEST PRACTICE**

```groovy
dependencyManagement {
    imports {
        mavenBom "io.netty:netty-bom:4.1.127.Final"
        mavenBom "io.grpc:grpc-bom:1.75.0"
    }
}
```

**Advantages:**
- ✅ **Declarative and explicit**: Easy to understand and maintain
- ✅ **Version alignment**: BOMs ensure that all modules of a library use compatible versions
- ✅ **Documented**: BOMs come with official documentation
- ✅ **Less error-prone**: Does not force versions, only suggests them
- ✅ **Better performance**: Gradle can optimize resolution better
- ✅ **Industry standard**: Used by Spring Boot, Spring Cloud, etc.

**Disadvantages:**
- ⚠️ Can be overridden by direct dependencies with explicit versions
- ⚠️ Does not force versions if there are conflicts


**When to use:**
- When the library provides an official BOM (Netty, gRPC, Spring)
- To align versions of multiple modules of the same library
- As the primary mechanism for version management

---

### 2. **Dependency Constraints** ⭐ **GOOD PRACTICE**

```groovy
dependencies {
    constraints {
        implementation('io.netty:netty-codec:4.1.127.Final') {
            because 'CVE-2025-48989, CVE-2025-55163, CVE-2025-58057'
        }
    }
}
```

**Advantages:**
- ✅ **Declarative**: Similar to BOMs but more granular
- ✅ **Documented**: You can add reasons (`because`)
- ✅ **Flexible**: You can specify exact versions or ranges
- ✅ **Does not force**: Only suggests, but can be overridden
- ✅ **Better than resolutionStrategy**: More explicit and maintainable

**Disadvantages:**
- ⚠️ Can be overridden by direct dependencies
- ⚠️ Requires specifying each module individually

**When to use:**
- When there is no BOM available
- For specific versions of individual modules
- As a modern alternative to `resolutionStrategy`

---

### 3. **Resolution Strategy** ⚠️ **LAST RESORT**

```groovy
configurations.all {
    resolutionStrategy.eachDependency { details ->
        if (details.requested.group == 'io.netty') {
            details.useVersion '4.1.127.Final'
        }
    }
}
```

**Advantages:**
- ✅ **Forces versions**: Guarantees that the specified version is used
- ✅ **Useful for urgent patches**: For critical vulnerabilities
- ✅ **Applies to all configurations**: runtime, test, compile, etc.

**Disadvantages:**
- ❌ **Imperative**: More difficult to understand and maintain
- ❌ **Can hide problems**: Masks real incompatibilities
- ❌ **Less efficient**: Executes during dependency resolution
- ❌ **Can break builds**: If it forces an incompatible version
- ❌ **Difficult to debug**: Errors can be confusing
- ❌ **Not declarative**: Does not clearly document intentions

**When to use:**
- Only for urgent security patches
- When BOMs and Constraints are not sufficient
- As a last resort when other mechanisms fail

---

## What is the Best Practice?

### Recommendation: **Mechanism Hierarchy**

```
1. BOMs (dependencyManagement)     ← FIRST OPTION
   ↓ (if no BOM available)
2. Dependency Constraints           ← SECOND OPTION
   ↓ (only for urgent cases)
3. Resolution Strategy              ← LAST RESORT
```


So Yes! For some reason, AI decided to use the last resort, instead of using the first (or at least the second) option. 

This reminds me we should always ask why. 



