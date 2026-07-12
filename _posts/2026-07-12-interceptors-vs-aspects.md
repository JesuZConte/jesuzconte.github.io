---
layout: post
title: "Spring Boot Architecture: Interceptors vs. Aspects (AOP)"
date: 2026-07-12
categories: [Spring-Boot, Architecture]
tags: [backend, java, microservices, aop, interceptors, clean-code]
---

When designing enterprise microservices, separating core business logic from cross-cutting concerns (like logging, security, metrics, and tracing) is non-negotiable. In the Spring ecosystem, we have two powerful tools to achieve this: **Interceptors** (`HandlerInterceptor`) and **Aspects** (AOP).

While they might look similar on paper, they operate in completely different dimensions of the framework. Misunderstanding their boundaries is a classic pitfall in technical interviews. Let's break them down.

---

### 1. Spring MVC Interceptors (`HandlerInterceptor`)

An Interceptor intercepts execution at the **network protocol level**. It catches the HTTP request right after it passes through the `DispatcherServlet`, but *before* it hits your `@RestController`.



Unlike passive loggers, an interceptor has full authority to **short-circuit and block the execution flow**. It forces you to deal with three lifecycle methods:

* **`preHandle(request, response, handler)`:** Executes before reaching the controller. It returns a `boolean`. If it returns `false`, Spring aborts the request execution immediately. Ideal for global API Key validation or token verification.
* **`postHandle(request, response, handler, modelAndView)`:** Executes after the controller processes the logic but before the response is serialized and dispatched back to the client.
* **`afterCompletion(request, response, handler, exception)`:** Executes at the very end of the request cycle. **This method is guaranteed to run, even if the controller throws an unhandled exception.** > **⚠️ Production Best Practice:** `afterCompletion()` acts as your HTTP-level `finally` block. This is the absolute safest place to trigger `MDC.clear()`. Because application servers reuse threads from a pool, failing to clear the Mapped Diagnostic Context here will cause thread context leakage—meaning a subsequent request from an entirely different user could inherit the previous user's tracking IDs in the log outputs.

---

### 2. Aspect-Oriented Programming (AOP Aspects)

An Aspect intercepts execution at the **code structure level (Java Methods)**. It does not know anything about HTTP, routing, Tomcats, or URLs. It simply watches the JVM method invocation graph.

Using execution predicates (*Pointcuts*), an aspect can inject cross-cutting logic (`@Before`, `@After`, `@Around`) into any bean method across any layer (Controllers, Services, or Repositories).

* **Primary Scope:** Method joinpoints (e.g., *"Intercept every method inside packages ending with `*Service` that starts with the word `execute`"*).
* **Flow Interruption:** An aspect does not return a boolean to stop execution. The only way an aspect can block the execution flow of a business method is by explicitly throwing a runtime exception (`throw new RuntimeException()`).

---

### Architectural Blueprint: Interceptors vs. Aspects

| Architectural Vector | HandlerInterceptor (Spring MVC) | Aspect / AOP (`@Aspect`) |
| :--- | :--- | :--- |
| **Framework Layer** | Deeply coupled with the **Web/HTTP layer**. | Transversal to **all layers** (Service, Repo, Web). |
| **Trigger Mechanism** | URL mapping rules and HTTP entry points. | Method signatures, names, or annotations. |
| **Context Aware** | Inspects `HttpServletRequest` and headers. | Inspects method arguments and return types. |
| **Flow Control** | Can clean-exit by returning `false`. | Can only disrupt flow by throwing Exceptions. |
| **Best Used For** | Token validation, HTTP tracing, `MDC` setup/cleanup. | Performance monitoring, caching, `@Transactional`. |

---

### Summary Checklist for System Design

* Use a **Filter** if the requirement is agnostic to Spring (e.g., low-level servlet request wrapping, security filtering, GZIP compression).
* Use an **Interceptor** if you need HTTP protocol metadata combined with knowledge of *which specific controller* is about to execute.
* Use an **Aspect** if you need to run logic before/after standard Java methods anywhere in the backend logic without polluting business code.
