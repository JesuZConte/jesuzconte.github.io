Since I don't always have the time to go to workshops (mostly because I am very far away) I've decided to document useful tips that I find around. 
Sometimes we don't dedicate enough time to think about how things work...

## Module 1: The Black Box and the Hidden Superpowers of javac

When we first learn Java, we are usually taught a very linear view of the world: you write a .java file, you run the javac myCode.java command in your terminal, and you magically get a .class file filled with bytecode that the Java Virtual Machine (JVM) can execute.

For most developers, the compiler (javac) is a black box. You feed text into one side, and as long as you respect the syntax rules (your semicolons, curly braces, and so on), it spits out executable code on the other. If you make a mistake, it throws a cold error message and comes to a halt.

But today I am here to tell you that we have been underestimating javac.

The Java compiler is not just a text-to-bytecode translator; it is an incredibly sophisticated linguistic analysis platform. Best of all: it provides open APIs that allow you to step inside the black box while it is doing its job.

What actually happens inside javac?
Before generating any bytecode, the compiler goes through several critical phases:

Parsing: It reads your source text files and converts them into an in-memory tree structure called an AST (Abstract Syntax Tree). At this stage, the compiler no longer sees "text"; it sees nodes representing "classes," "methods," "for loops," and so on.

Type Resolution: It maps names to their actual definitions. It knows with absolute certainty whether variable x is a String or an integer, and whether the method you are invoking actually exists on that specific class.

Annotation Processing: This is where the magic most developers use without even realizing it takes place.

If you know how to use the compiler’s internal APIs (such as the Pluggable Annotation Processing API introduced in Java 6, or the platform compiler APIs in com.sun.source), you can interact with the AST in real time.

The superpowers you are already using (indirectly)
It is highly likely that you have already benefited from this. Think of tools like:

- Lombok: When you drop a @Data annotation onto a class and getters, setters, and constructors magically appear. Lombok mutates the AST directly during compilation.

- MapStruct: You define a @Mapper interface, and upon compilation, MapStruct automatically generates the plain Java implementations to map your DTOs.

- Spring Boot: It leverages annotation processors to index components and generate metadata that speeds up your application's startup time.

None of these tools "guess" what you wrote by parsing raw text. They do it because they extend the compiler, inspect the semantic structure of your code, and react before the .class file is ever created.

## Module 2: From Syntax to Semantics (Why Regex Fails)
To understand why this is a true superpower, let’s do a quick mental exercise. Imagine your engineering team wants to ban developers from using System.currentTimeMillis() directly, because using the modern java.time.Clock API makes unit testing time-dependent logic much easier.

How would you enforce this?

Approach 1: A Regular Expression (Regex) script in your CI/CD pipeline.
You could scan for the string "System.currentTimeMillis()". But what happens if someone writes a comment like // Do not use System.currentTimeMillis()? Your script will trigger a false positive. Or what if someone uses a static import like import static java.lang.System.currentTimeMillis; and then just calls currentTimeMillis()? Your Regex will completely miss it.

The Compiler Approach (Semantics):
javac doesn't care how you format your whitespace, your comments, or your static imports. When compiling, the AST will contain a "Method Invocation" node. The compiler knows with mathematical certainty that this node invokes the currentTimeMillis method belonging to the java.lang.System class.

By extending the compiler, you can write rules based on the meaning (semantics) of the code, rather than how it happens to be written textually (syntax).

[Q&A Bonus] Do Custom Annotations Work at the Compiler Level?
A common question that comes up when we start lifting Java's hood is: If I create a custom annotation, does it automatically work at the compiler level?

The short answer is: Yes, but only if you (or a framework) write the code that tells the compiler what to do with it.

Annotation Anatomy: @Retention
When you build a custom annotation in Java, you must define its lifecycle using the @Retention meta-annotation. There are three levels:

RetentionPolicy.SOURCE: The annotation only lives in the .java file. The compiler sees it but discards it entirely when generating the .class file (e.g., @Override).

RetentionPolicy.CLASS: The annotation is recorded in the .class file but is ignored by the JVM at runtime. This is the compiler's backyard.

RetentionPolicy.RUNTIME: The annotation is preserved in the .class file and loaded by the JVM, allowing you to inspect it at runtime via Reflection (e.g., Spring's @RestController).

How the Compiler Reacts to Your Annotation
By default, if you create a custom annotation like @MyValidation, place it on a class, and compile, absolutely nothing extraordinary will happen. The compiler will simply say, "Alright, I have logged that this class is tagged with @MyValidation", save that metadata into the .class file, and move on. Annotations on their own are passive metadata.

To give them "superpowers" at compile time, you need an Annotation Processor.

Here is how they interact:

Registration: You create a class that extends AbstractProcessor (a standard Java API) and register it so javac knows: "Hey, I am the one in charge of handling the @MyValidation annotation."

The Compilation Loop (Rounds): When you run javac, the compiler spots your annotation, pauses bytecode generation, and hands control over to your Annotation Processor.

Semantic Inspection: Your processor receives the exact segment of the Abstract Syntax Tree (AST) where the annotation was applied. Here, you can enforce compiler-level assertions. For example: "If the developer used @MyValidation on a method, but that method is not public, fail the compilation immediately."

Code Generation: The compiler allows your processor to generate brand new source files based on that annotation (which is exactly how MapStruct or Lombok work).

## Module 3: Error Prone – Google's Co-Pilot Inside javac
We now understand that we can hook into javac using Annotation Processors and native compiler APIs. But let’s be honest: writing an annotation processor from scratch, manually manipulating the AST (Abstract Syntax Tree), and wrestling with Java's internal compiler APIs is hard, error-prone, and requires heavy engineering.

This is where Google enters the picture with a brilliant solution they built to manage their massive monorepo: Error Prone.

What is Error Prone?
Error Prone is an open-source static analysis framework for Java, but with a unique twist: it is not an external tool. Unlike SonarQube or Checkstyle, which typically run after compilation or as separate pipeline steps, Error Prone hooks directly into javac or replaces the standard compiler entirely.

Google’s core philosophy is simple:

"If we know a specific code pattern is almost certainly a bug, that code shouldn't even finish compiling."

How Does It Work Under the Hood?
When you enable Error Prone in your project (usually via a simple Maven or Gradle plugin), the compilation lifecycle shifts:

javac starts compiling your code normally and builds the AST.

Before the compiler translates that AST into bytecode, Error Prone intercepts the process.

Error Prone runs the AST through hundreds of built-in checks (crafted by Google engineers after analyzing millions of lines of code).

If it matches a known bug pattern, it halts the compilation, prints a detailed error to the console, and—in many cases—even suggests the exact line of code needed to fix it!

A Real-World Example: The String.equals() Oopsie
Imagine you accidentally type this in your codebase:
```
String name = "Adib";
// You wanted to check if they are NOT equal, but put the exclamation mark inside the equals call
if (name.equals(!otherVariable)) { 
    // ...
}
```
If you compile this with standard Java, it compiles perfectly. Java just sees that you are passing a boolean (the result of !otherVariable) into a method that accepts an Object. Semantically legal, logically disastrous. This is a production bug waiting to happen.

With Error Prone enabled, the build instantly breaks with a helpful message:
```
[Error Prone] StringEqualsEmptyString: The equals() method received a boolean instead of a String. This is almost certainly a logical error.
    -> Did you mean: if (!name.equals(otherVariable))?
```

Why Error Prone is a Game Changer for Teams
- Shift-Left Feedback Loop: You don't need to wait for a nightly CI/CD build or an external server to review the code. The developer catches the mistake in their IDE or terminal in three seconds, while they are still writing the code.

- It Is Extensible: You aren’t limited to Google's built-in rules. If your team uncovers a highly specific bug pattern that keeps repeating, you can write a custom Error Prone check in just a few lines of Java to ban that pattern forever.

- Enforcing Architectural Boundaries: You can write a compiler-level rule stating: "If a class is annotated with @Repository, it is strictly forbidden from directly calling a @Controller method." If anyone tries to bypass this architecture, the compiler breaks the build.

- Error Prone democratizes the compiler's superpowers. Instead of forcing you to build complex bytecode manipulators, it provides an elegant, user-friendly API to scan the semantic meaning of your code (the AST) at compile time, catching bugs before they ever leave a developer's machine.


## Module 4: The Reality Anchor for AI Coding Agents

Let’s look toward the immediate future of our profession. We are living in the era of Coding Agents. We are no longer just using auto-complete co-pilots; today, we can hand over a Jira ticket to an autonomous AI agent, which scans the repo, writes the code, opens a Pull Request, and sometimes even deploys it.

While incredibly efficient, this introduces a brand-new hazard: hallucinations and a lack of architectural context.
The Problem with Guiding AI via Text (Prompts)
When we want humans and AI to follow our company's engineering standards, our first instinct is to write documentation: a README.md, a Confluence wiki, or a massive system prompt that says: "Do not use library X, use library Y," or "Remember that in this architecture, the view layer cannot call the database directly."

The problem?

Humans don't read documentation (or they forget it).

AI agents suffer from "Context Drift" in long conversations. If the prompt is too long or the codebase is complex, the AI might subtly ignore your constraints, generating code that is technically valid Java but architecturally banned.

Documentation and prompts are probabilistic, not deterministic. There is only a likelihood that the AI will comply, not a guarantee.

### The Solution: The Deterministic Feedback Loop
This is where combining AI + Error Prone (The Compiler) becomes an absolute stroke of genius. Instead of begging the AI via a prompt to follow the rules, we turn our architectural boundaries into hard compiler errors using Error Prone.

Look at how the workflow shifts for an AI Agent:

1. The AI agent generates code and attempts to compile it.

2. javac, powered by your custom Error Prone rules, halts the compilation because the AI violated a team design pattern.

3. The compiler doesn’t just throw a generic error; it returns a structured, deterministic, and actionable message: [Error Prone] BannedMethod: You cannot call the database from a View controller. Suggestion: Use the Service layer instead.

4. The AI reads this compiler output. Since Large Language Models are exceptionally good at fixing code when provided with precise error diagnostics, the AI adjusts its code in seconds and retries.

### The Compiler as the "Single Source of Truth"
By doing this, you achieve something that previously seemed impossible: you unify the enforcement mechanism for both humans and machines. You no longer maintain a markdown guide for humans and a separate prompt configuration file for the AI. You have one strict compiler acting as the ultimate arbiter. If it doesn’t compile, it doesn't exist. It is the reality anchor that keeps AI aligned with your standards, no matter how fast it generates code.

## Practical Guide: Error Prone in Action
To get started with Error Prone, you don't import a traditional Java library to call it via code. Instead, you modify how your build tool (Gradle or Maven) invokes javac.

### Step 1: Configuration (Your build.gradle)
Add the following setup to inject Error Prone into your compilation lifecycle:

```
plugins {
    id 'java'
    // 1. Apply the Gradle Error Prone plugin
    id 'net.ltgt.errorprone' version '4.0.1' 
}

repositories {
    mavenCentral()
}

dependencies {
    // 2. Import the core Error Prone engine
    errorprone "com.google.errorprone:error_prone_core:2.31.0"
}
```

### Step 2: The Hidden Bug Example
Consider this extremely common developer oversight that standard Java completely ignores:

```
import java.util.Objects;

public class UserService {
    public void registerUser(String username) {
        // BUG: The developer intended to throw an exception if null,
        // but confused Objects.requireNonNull() with a boolean check.
        // This line does absolutely nothing!!!
        Objects.isNull(username); 

        System.out.println("Registering: " + username);
    }
}
```

Standard javac will yield a deceitful BUILD SUCCESSFUL. It thinks: "Well, a static method was called, it returned a boolean, and nobody saved it. It's useless code, but legally valid." The bug slips straight into production.

### Step 3: Compile-Time Catch
With Error Prone enabled, running ./gradlew compileJava will instantly fail your build:
```
/src/main/java/UserService.java:6: error: [ReturnValueIgnored] Return value of this method must be used
        Objects.isNull(username);
                      ^
    (see https://errorprone.info/bugpattern/ReturnValueIgnored)
    Did you mean remove this line, or throw an exception?
```
Error Prone scans the AST (Abstract Syntax Tree), recognizes that Objects.isNull is a pure function with no side effects, realizes you ignored the return value, and stops the build while offering the exact fix.

## Conclusion
Extending the Java compiler is neither an academic exercise nor a waste of time for optimization purists. In the modern software landscape, mastering tools like Error Prone is the only scalable way to maintain code quality economically. By programming the compiler, you build an automated immune system for your codebase—protecting it from both human oversight and machine hallucinations.
