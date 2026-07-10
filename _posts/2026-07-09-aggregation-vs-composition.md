---
layout: post
title: "Composition vs. Aggregation: Modeling E-Commerce Domains in Java"
date: 2026-07-10
categories: [Java, Software-Design]
tags: [backend, architecture, ecommerce, java, interview-prep]
---

When designing modern applications in Java, you will constantly hear the advice: *"Favor composition over inheritance."* It is an excellent rule, but it often leads to a tricky interview question that traps many backend developers: **What is the actual difference between Composition and Aggregation?**

Both represent a **"has-a" relationship** where one object contains another. However, the golden rule to tell them apart lies in the **Lifetime Bond** between the parent and the child. 

Let's look at how this works using real-world retail system examples.

---

### 1. Composition: The E-Commerce Shopping Cart (The Strong Bond)

Composition is a **strong** relationship where the child object **cannot exist independently** of its parent. If the parent object is destroyed, the child is wiped out from memory along with it.

**The Retail Example:** Think of a **`ShoppingCart`** and its **`CartItem`** instances. A `CartItem` represents a specific line in a cart (e.g., *2 units of SKU: Blue-Jeans-Size-M*). This item only makes sense inside that active session. If the user clears the cart or abandons it and the session expires, the `CartItem` instances are destroyed instantly. A "Cart Item" cannot wander around the database without an associated cart.

In Java, the parent class handles the instantiation of the child directly, binding their lifetimes together:

```java
public class CartItem {
    private String sku;
    private int quantity;

    public CartItem(String sku, int quantity) {
        this.sku = sku;
        this.quantity = quantity;
    }
}

public class ShoppingCart {
    private final List<CartItem> items;

    public ShoppingCart() {
        this.items = new ArrayList<>();
    }

    public void addProduct(String sku, int quantity) {
        // Pure Composition: The Cart instantiates the CartItem directly.
        // Its lifetime is completely controlled by the ShoppingCart.
        this.items.add(new CartItem(sku, quantity));
    }
}
```

### 2. Aggregation: Orders and Customers (The Loose Bond)
Aggregation is a weak relationship where the parent contains the child, but the child can exist completely independently. If the parent is destroyed, the child survives.

The Retail Example: Think of an Order and a Customer. An order has a customer reference to know who bought the products. However, if an order is canceled or archived and deleted from the live system, the Customer object does not vanish. The customer profile remains intact in your User Service, holding their preferences, addresses, and loyalty points, ready to place a new order tomorrow.

In Java, this is implemented via Dependency Injection, where the child is created independently and passed to the parent:

```
public class Customer {
    private String customerId;
    private String email;

    public Customer(String customerId, String email) {
        this.customerId = customerId;
        this.email = email;
    }
}

public class Order {
    private String orderId;
    private Customer customer; // The Order "has a" customer reference

    // Aggregation: The Customer existed beforehand and is passed as a reference.
    public Order(String orderId, Customer customer) {
        this.orderId = orderId;
        this.customer = customer;
    }
}
```

### Summary Cheat-Sheet

| Characteristic | Composition | Aggregation |
| :--- | :--- | :--- |
| **Relationship Type** | Strong "has-a" (Part-of) | Weak "has-a" (Has-a) |
| **Lifetime Control** | Parent strictly controls the child's lifetime. | Child's lifetime is completely independent. |
| **Java Implementation** | Instantiated *inside* the parent class. | Passed *into* the parent from the outside. |
| **E-Commerce Example** | `ShoppingCart` $\rightarrow$ `CartItem` | `Order` $\rightarrow$ `Customer` |

----

So why does the industry constantly push us away from inheritance? The short answer is: **Inheritance is rigid and breaks under changing business requirements, while composition gives you ultimate flexibility.**

Let's see how this unfolds in a real e-commerce payment domain (like building checkout flows for Falabella or Macy's).


### The Problem: The Inheritance Trap (Rigid Hierarchies)

Inheritance forces a tight coupling between the parent and the child class at compile-time. If Class B extends Class A, it drags along everything Class A does, whether it needs it or not.

Imagine we are building a payment module. We start with a base class:

```java
public class PaymentProcessor {
    public void processTransaction(double amount) {
        System.out.println("Processing standard payment...");
    }
}
```

Since our platform accepts credit cards, we use inheritance to extend the behavior:

```
public class CreditCardProcessor extends PaymentProcessor {
    // Inherits processTransaction() perfectly
}
```
Everything runs smoothly until the business team comes back with new requirements. They want to introduce PayPal (which requires a web redirect) and a Store Points payment system (which requires looking up a customer loyalty balance).

Later, they drop the ultimate challenge: "We need a Hybrid Payment Option where a user can pay 30% with Store Points and 70% with a Credit Card."

This is where inheritance collapses. Java does not support multiple inheritance. You cannot write:
public class HybridProcessor extends CreditCardProcessor, PointsProcessor // Compile Error!

If you try to bypass this by creating deep nested trees (CreditCardWithPointsProcessor, PayPalWithCouponsProcessor), your codebase will spiral into a maintenance nightmare.

### The Solution: Composition (Pluggable Behaviors)
Composition takes a different approach. Instead of saying "This hybrid processor is a credit card processor", we say "This checkout system has a payment strategy".

Instead of inheriting code, we inject small, swappable pieces of behavior using interfaces.

First, we define the behavior as an abstract contract:
```
public interface PaymentStrategy {
    void pay(double amount);
}
```
Next, we write the standalone implementations for each payment gateway:
```
public class CreditCardStrategy implements PaymentStrategy {
    public void pay(double amount) {
        System.out.println("Charged $" + amount + " via Credit Card API.");
    }
}

public class PayPalStrategy implements PaymentStrategy {
    public void pay(double amount) {
        System.out.println("Redirecting to PayPal portal for $" + amount);
    }
}
```

Now, *our core processor* **composes** its behavior. It doesn't extend anything; it just holds a reference to the strategy:
```
public class RetailCheckout {
    private PaymentStrategy paymentStrategy; // Composition: "Has-a" strategy

    // Runtime Flexibility: We can swap the behavior on the fly!
    public void setPaymentStrategy(PaymentStrategy paymentStrategy) {
        this.paymentStrategy = paymentStrategy;
    }

    public void executeCheckout(double amount) {
        // Delegation: Passing the heavy lifting to the composed piece
        paymentStrategy.pay(amount); 
    }
}
```
### Why Composition Wins in Production
- Runtime Flexibility: With inheritance, an object cannot change its nature once created. With composition, you can switch a checkout session from Credit Card to PayPal instantly using a setter method.

- Loose Coupling: If PayPal updates its SDK, you only modify PayPalStrategy. The core RetailCheckout class remains untouched and risk-free.

- Testability: Mocking an injected interface (PaymentStrategy) during unit testing is incredibly easy. Mocking a parent class method that hits a live database is a nightmare.

### Summary Cheat-Sheet 

- Inheritance is static: Relationships are locked at compile-time and lead to rigid class explosions.

- Composition is dynamic: It allows objects to change their behavior at runtime by swapping encapsulated components.

- The Rule of Thumb: Use inheritance only when a subclass is strictly a specialized version of the parent forever (e.g., Square is a Shape). For everything else involving features or tools, use composition.
