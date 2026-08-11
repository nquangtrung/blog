---
title: "Learning Go Concurrency with a PubSub Broker - GoBroke Series"
date: 2026-08-11T12:41:31+02:00
draft: false
---

# GoBroke: Building a Pub/Sub Broker in Go

## Overview

**GoBroke** is a hands-on exploration of Go's concurrency patterns through building a pub/sub (publish-subscribe) broker from scratch. This series dives deep into goroutines, channels, context, and mutexes—the fundamental building blocks of concurrent Go applications.

A pub/sub broker is a messaging system where publishers send messages to topics without caring who receives them, while subscribers listen to topics and receive messages. Building one from scratch is one of the best ways to truly understand Go's concurrency model.

## Series Parts

- **[Part 1: Architecture & Patterns](../part1-pubsub-and-concurrency/)** - Learn how GoBroke uses goroutines, channels, context, and mutexes to build a thread-safe message broker
- **[Part 2: Strategy Pattern for Subscribers](../part2-strategy-pattern/)** - Explore design patterns for flexible and maintainable broker implementations

## About This Series

This is an **ongoing effort** for self-learning Go and the underlying workings of broker systems. Each part builds practical understanding through implementing real-world patterns and concurrency concepts.

**GitHub Repository:** [nquangtrung/gobroke](https://github.com/nquangtrung/gobroke)

**License:** MIT
