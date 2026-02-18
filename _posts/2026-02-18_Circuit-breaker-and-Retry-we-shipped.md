# Circuit Breaker and Retry: What We Shipped and What We Learned

For a new project it was requested to add Circuit breaker and Retry, so we could avoid making calls to another service if we get constant failures.
The project that I worked on uses Spring boot 3 and Java 21.

We added Resilience4j (Circuit Breaker and Retry) around outbound HTTP calls to a downstream service. This note is a short, generic recap of what we did and the questions that came up along the way—meant as a reference for other projects, not a step-by-step recipe.

---

## What we built

We use a Circuit Breaker that wraps Retry: one "call" for the breaker is the whole method run, including all retries. When the circuit is open or retries are exhausted, a fallback throws a single domain exception (e.g. a 500) instead of leaking the client's exception. Retry is only for transient failures (e.g. 5xx, connection/timeout), and we ignore `CallNotPermittedException` in retry so that when the circuit is open we fail fast and don't retry.

---

## "The circuit isn't opening after the failed trial"

In the integration test (we did it using WireMock, not the real service!) we opened the circuit, waited for half-open, sent one trial call that failed (e.g. 503), and expected the next call to fail immediately without hitting the backend. Instead, that next call was still going to the backend and getting 503. So we asked: *why isn't the circuit opening after the trial fails?*

The important detail was configuration. We hadn't set `permittedNumberOfCallsInHalfOpenState` explicitly. By default (or via framework defaults) the instance was allowing more than one call in half-open, so the first failed trial didn't trigger a transition back to OPEN. Once we set it to 1 in the circuit breaker config (e.g. in `configs.default` or the instance), the behaviour matched what we wanted: one trial, it fails, circuit goes OPEN, next call fails fast. So the first lesson: **make the half-open behaviour explicit in config**, don't rely on "it should be 1 by default."

---

## What exception are we actually seeing?

When the "next" call was still hitting the backend, we weren't getting `CallNotPermittedException`. The question was: *if it's not that, what is being thrown?* In our case it was our domain exception (e.g. `DownstreamException`) with a cause of `HttpServerErrorException` (503)—because the call was still going through to the backend. That confirmed the circuit wasn't open. So checking the **actual** exception type and cause in tests (and in production) is useful to tell "circuit open, fail-fast" from "still calling backend and getting 5xx."

---

## "Was this already broken before we touched the tests?"

We had changed the test to use a stricter assertion (exact count and `CallNotPermittedException`). So we asked: *did this only start failing when we tried Awaitility, or was it already wrong before?* The answer was: the behaviour (circuit not opening after the failed trial) was likely already there. The old test used a loose assertion (e.g. a range of counts), so it still passed. Making the assertion precise didn't introduce the bug—it **exposed** it. That's a good reminder that **tightening test assertions can reveal existing bugs**; the failure is useful information.

---

## Stub and "real" behaviour

We also asked: *maybe the problem is that we stub the backend to always return 503—so it's not real behaviour?* The stub was correct. We *want* the backend to return 503 for the trial. The real issue was that the **next** call should never reach the stub at all when the circuit is open. So the stub wasn't hiding the bug; the bug was that the circuit wasn't opening. Keeping that distinction clear (stub = "what the backend would return **if** we called it") helps when debugging resilience tests.

---

## How many calls in half-open?

We had to be precise about: *in half-open, how many "calls" are allowed, and how many retries does that mean?* For us, the circuit allows **one** logical call in half-open (`permittedNumberOfCallsInHalfOpenState: 1`). That one call still goes through Retry, so it can do up to 3 HTTP attempts. So we see 3 backend requests for that single "trial" call. The next invocation after that trial should not be permitted if the trial failed—hence the need for the config fix above.

---

## Why we didn't use Awaitility for the half-open wait

The review made by Gitlab Duo suggested replacing `Thread.sleep` with Awaitility to wait for the circuit to become half-open. We tried polling the circuit state (e.g. "wait until state is HALF_OPEN"), but the condition never became true within the timeout. We learned that in our setup the OPEN → HALF_OPEN transition is evaluated **on the next permission check** (when a call is made), not by a background scheduler that updates state on a timer. So **polling the state without making a call** never sees HALF_OPEN. We kept a short, documented sleep aligned with the test profile's `waitDurationInOpenState` and made it explicit in a comment why we don't use Awaitility for this particular wait. So: **sometimes a small, well-justified sleep is the right choice** when the framework's state transition is lazy.

---

## When does it "go back to normal"?

After the trial fails and the circuit goes back to OPEN, we asked: *when does it return to normal?* It doesn't jump straight from OPEN to CLOSED. It waits **again** for `waitDurationInOpenState`, then on the next call it moves to HALF_OPEN and allows one trial. If that trial **succeeds**, the circuit closes and we're back to normal. If it **fails**, we're OPEN again and the cycle repeats. So "back to normal" is: wait → half-open → one successful trial → CLOSED.

---

## Tests: precise assertions and lambdas

We made the assertion strict: total backend calls must be exactly the number we expect (e.g. `MAX_RETRIES`), and the exception must be our domain exception with cause `CallNotPermittedException`. That made the "fail fast" behaviour explicit. We also got a static-analysis warning about the lambda passed to `assertThatThrownBy`: it wanted **one** invocation that could throw. We had something like `() -> service.call(sampleRequest())`—two potential throw points (building the request and the call). We refactored to build the request outside the lambda and pass it in, so the lambda only had one invocation. Small change, clearer intent and happier tools.

---

## Keeping tests fast and config clear

We didn't want the pipeline to pay a huge cost for resilience tests. So we used a **test profile** with shorter timeouts: smaller `waitDurationInOpenState` and shorter retry delays (and optionally smaller backoff). The scenarios stay the same; only the waiting times change. We also removed a redundant override: the test profile already set the same property we were setting in `@DynamicPropertySource`, so we deleted the duplicate to avoid confusion and drift.

---

## What we test and what we don't

We mapped our tests to a small "coverage" view: what's covered by automated tests and what isn't. We cover: circuit opens after threshold, next call fails fast, half-open trial (success closes, failure reopens), retry count and non-retryable errors (e.g. 4xx except 408/429), and that retry runs before the circuit opens and that the open circuit blocks calls. We don't assert the HALF_OPEN state directly, exponential backoff timing, metrics, or per-environment config—those we're comfortable validating manually or via smoke tests. So the article isn't a recipe; it's a record of **what we decided to automate and what we left for other ways of checking**.

---

## Smoke tests and E2E

We talked about whether to move E2E tests into a "smoke" directory and use a tag. The takeaway we kept: **E2E** describes how the test runs (full stack, real HTTP); **smoke** describes the goal (minimal sanity check after deploy). The same test can be both. Using a tag (e.g. `smoke`) is useful so you can run "only smoke" after deploy and "all tests" in CI. Renaming the package to "smoke" only makes sense if that package will only ever contain those minimal checks; otherwise keeping an "e2e" (or similar) package and tagging the subset that are smoke keeps things flexible.

---

## CSRF and "why we dismiss this finding"

We have a stateless REST API with no cookie-based sessions. The scanner reported CSRF (e.g. "CSRF disabled"). We dismiss it with a short justification: the API is consumed by programmatic or server-to-server clients and/or token/header-based auth; there are no session cookies for a cross-site request to abuse. So disabling CSRF is intentional and acceptable. Having that reason written down (e.g. in the vulnerability ticket) helps future readers and auditors.

---

## Closing

We didn't follow a single recipe. We hit a misconfiguration (half-open permits), clarified what we were actually seeing (exceptions, counts, state transitions), tightened tests and config, and decided what to automate versus what to check manually. This note is that journey in generic form—hopefully useful as a reference when you add Circuit Breaker and Retry in another project.

## Documentation
If you want to know more about how to configure Circuit breaker, these are some docs I followed (and of course, the help of AI):

https://resilience4j.readme.io/docs/getting-started-3
https://stackoverflow.com/questions/75327239/circuit-breaker-is-not-showing-in-component-section-in-spring-boot
