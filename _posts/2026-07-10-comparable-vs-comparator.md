---
layout: post
title: "Java Sorting Architecture: When to Use Comparable vs. Comparator"
categories: [Java, Collections]
tags: [backend, java, sorting, clean-code, interview-prep]
---

When building a high-quality user experience for an e-commerce catalog, sorting data dynamically is a core requirement. Customers expect to sort items by natural defaults, price ranges, or customer review rankings.

In Java, this behavior is governed by two distinct interfaces: **Comparable** and **Comparator**. 

Interviewers love to test your knowledge on this because it demonstrates whether you understand clean code principles, decoupling, and the Open-Closed Principle (from SOLID). Let's break down the technical differences.

---

### 1. `Comparable`: Defining the Natural Order

The `Comparable` interface is implemented **internally** within the domain class itself. It defines what is known as the **natural ordering** of the object.

* **The Contract:** It forces the class to implement a single method: `compareTo(T o)`.
* **E-Commerce Use Case:** Imagine your `Product` class has an ID, a name, and a price. You decide that the structural default order of a product should always be its technical `id`. 

```java
public class Product implements Comparable<Product> {
    private int id;
    private String name;
    private double price;

    // Standard constructor, getters, setters

    @Override
    public int compareTo(Product other) {
        // Compares this product's ID with another product's ID
        return Integer.compare(this.id, other.id);
    }
}
```
Whenever you invoke `Collections.sort(productList)`, Java automatically defaults to this internal blueprint. It modifies the class behavior natively.

### 2. `Comparator`: Custom, Decoupled Sorting Strategies

The `Comparator` interface is implemented externally from the domain class. It allows you to build multiple, separate sorting strategies without altering the original class code.

* **The Contract**: It forces the implementation of the method: compare(T o1, T o2).

* **E-Commerce Use Case**: Your business needs to let users sort items by price (low-to-high) or by consumer ratings. You can't fit all those conflicting logics inside Product. Instead, you define explicit comparators—often using modern Java Lambdas:

```java
// Sorting strategy 1: By Price (Low to High)
Comparator<Product> priceComparator = (p1, p2) -> Double.compare(p1.getPrice(), p2.getPrice());

// Sorting strategy 2: By Name alphabetically
Comparator<Product> nameComparator = (p1, p2) -> p1.getName().compareTo(p2.getName());

// Usage in collections:
productList.sort(priceComparator);
```

This adheres perfectly to the *Open-Closed Principle*: Your Product class is closed for modification but open for extension via custom sorting strategies.

### Summary Cheat-Sheet

| Metric | `Comparable` Interface | `Comparator` Interface |
| :--- | :--- | :--- |
| **Package Location** | `java.lang` (Core framework). | `java.util` (Utility toolkit). |
| **Implementation** | **Internal.** The class modifies its own type definition. | **External.** Written as separate strategy classes or lambdas. |
| **Method Name** | `compareTo(T o)` (Takes **one** argument). | `compare(T o1, T o2)` (Takes **two** arguments). |
| **Flexibility** | **Rigid.** Provides exactly one default natural ordering. | **Highly Flexible.** You can define infinite custom sorting filters. |
| **Modification Cost** | Requires changing the actual source code of the class. | Does not affect the target data model class at all. |
