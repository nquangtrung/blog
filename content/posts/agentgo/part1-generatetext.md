---
title: "How to Make an AI SDK Clone in Golang - Part 1 - GenerateText"
date: 2026-08-05T20:07:22+02:00
draft: false
---

![image](https://firebasestorage.googleapis.com/v0/b/trontria-blog.appspot.com/o/part1-generatetext%2Fgopher5logo.jpg?alt=media&token=5905cc4b-b3d1-4c30-9f30-1911a3591ce4)

Hey there! 👋 Welcome! I'm excited to share this journey with you. We're building our own AI SDK in Go, and honestly, it's a great way to level up your Go skills while creating something useful.

If you've ever wondered how libraries like the OpenAI SDK work under the hood, this is our chance to learn together! In this first part, we'll build the **foundation** using three powerful patterns: **Interfaces**, **Composition** (Go's take on inheritance), and the **Factory Pattern**. 

These aren't just fancy buzzwords—they're practical tools that make code flexible, testable, and easy to extend. Let's start with making a simple `GenerateText` function that is simple but flexible enough to handle different LLM providers. By the end, you'll understand how to support multiple AI services (OpenAI, Gemini, Claude) with clean, maintainable Go code. Let's dive in! 🚀

**📌 All the code from this blog is available on GitHub: https://github.com/nquangtrung/agentgo**

## Why Providers? (Good Design Matters!)

Imagine you're building an SDK for just OpenAI. You hardcode everything: API calls, error handling, response parsing—all specific to OpenAI. It works great!

Then your boss says: "We need to support Google Gemini too." 

Now what? Do you copy-paste all that OpenAI code and modify it? That's a mess. You'd have duplicated logic, and if you find a bug, you have to fix it in multiple places.

The **Provider Pattern** solves this elegantly. Here's the idea:

1. **Define a contract**: Create an interface that says "Any AI provider must be able to do X and Y"
2. **Implement for each service**: OpenAI implements it one way, Gemini another way, Claude yet another
3. **Write code once**: Your main SDK logic works with *any* provider that follows the contract

This is good Go design, and you'll see this pattern everywhere in real-world Go codebases!

## The Interface: Our Contract with Providers

This is where Go gets elegant. We define an **interface**—think of it as a promise: "Any AI provider that wants to work with us must implement these methods."

```go
type AgentProvider interface {
	GetContext() models.LanguageModelContext
	GenerateText(prompt string) (models.LanguageModelOutput, error)
}
```

That's it! Just two methods:
- **GetContext()**: Give us information about which model you are
- **GenerateText()**: Take a prompt and generate text

Any provider (OpenAI, Gemini, Claude) that implements these two methods can be used interchangeably in our SDK. This is the power of Go's interface design—no inheritance hierarchy, no complexity, just simple contracts.

## The Base Implementation: Avoiding Repetition

If we're going to have OpenAI, Gemini, and Claude providers, they're all going to have some common code. Rather than repeat ourselves (which is bad!), let's create a base struct:

```go
type AgentProviderImpl struct {
	Context models.LanguageModelContext
}

func (p AgentProviderImpl) GetContext() models.LanguageModelContext {
	return p.Context
}
```

This is **composition** in Go—one of my favorite Go concepts! Here's what's happening:
- We create a struct `AgentProviderImpl` that has the common `Context` field
- We implement `GetContext()` here, so every provider gets it for free
- Each concrete provider (OpenAI, Gemini, etc.) can **embed** this struct and focus only on implementing `GenerateText()`

Remember: In Go, we don't have inheritance. Instead, we use composition and embedding. When you embed `AgentProviderImpl`, you automatically get all its fields and methods. It's lightweight, clear, and very Go-like!

## The Data Models: Standardizing Our Communication

Every provider (OpenAI, Gemini, Claude) returns different JSON structures. Our data models **normalize** this into a standard format:

```go
type LanguageModelContext struct {
	ModelName string
}

type LanguageModelOutput struct {
	Text      string
	Usage     LanguageModelUsage
	ModelName string
}

type LanguageModelUsage struct {
	OutputTokens, InputTokens, CachedTokens, ReasoningTokens int
}
```

Simple! Your code only needs to understand our models, not the raw API responses. That's clean design!

## Meet the OpenAI Provider

Now let's implement a real provider for OpenAI! Here's the cool part—we're **embedding** (Go's version of inheritance) our base implementation:

```go
type OpenAIProvider struct {
	AgentProviderImpl  // We get GetContext() for free!
	APIKey string
}

func (p OpenAIProvider) GenerateText(prompt string) (models.LanguageModelOutput, error) {
	// Create an OpenAI client
	client := openai.NewClient(option.WithAPIKey(p.APIKey))

	// Call the OpenAI API
	resp, err := client.Responses.New(context.TODO(), /* params */)
	if err != nil {
		return models.LanguageModelOutput{}, err
	}

	// Return our standardized format (no API-specific stuff leaking out!)
	return models.LanguageModelOutput{
		Text:      resp.OutputText(),
		Usage:     /* token counts */,
		ModelName: p.AgentProviderImpl.Context.ModelName,
	}, nil
}
```

See what's happening here? 
- `OpenAIProvider` **embeds** `AgentProviderImpl`, so it automatically inherits the `GetContext()` method. No need to rewrite it!
- We add OpenAI-specific stuff (like `APIKey`)
- We implement `GenerateText()` with OpenAI-specific logic
- We return data in our standardized format

This is the beauty of Go's composition! Any code using our SDK can just work with the `AgentProvider` interface without caring if it's OpenAI, Gemini, or Claude.

## The Factory Pattern: Smart Provider Creation

Here's where the magic happens! The **Factory Pattern** hides complexity. Instead of making users say "I need an OpenAI provider with this API key," they just say "I want gpt-5," and we figure out the rest.

The factory function does three things:
1. Detect which provider we need (by checking model name prefix)
2. Load the API key (from argument or environment)
3. Create and return the right provider

Here's the factory function:

```go
func CreateAgentProvider(params AgentProviderFactoryParams) (AgentProvider, error) {
	// Step 1: Figure out which provider this model needs
	modelType, supported := FindSupportedModel(params.ModelName)
	if !supported {
		return nil, fmt.Errorf("unsupported model: %s", params.ModelName)
	}

	// Step 2: Get the API key (from params or environment)
	apiKey := params.APIKey
	if apiKey == "" {
		apiKey = utils.GetEnvVar(getEnvKeyForModel(modelType))
	}
	
	if apiKey == "" {
		return nil, fmt.Errorf("no API key found for %s", modelType)
	}

	// Step 3: Create the right provider
	switch modelType {
	case MODEL_OPENAI:
		return NewOpenAIProvider(apiKey, params.ModelName), nil
	case MODEL_GEMINI:
		return NewGeminiProvider(apiKey, params.ModelName), nil
	// ... add more providers as needed
	default:
		return nil, fmt.Errorf("provider not implemented yet")
	}
}
```

This is the **Factory Pattern** in action! The caller doesn't need to know about OpenAI, Gemini, or API keys. They just ask for a provider, and we handle all the complexity behind the scenes.

## Using It All Together

Now that we've built our infrastructure, using it is incredibly simple! Check out how the SDK's public API works:

```go
func GenerateText(params GenerateTextParams) (models.LanguageModelOutput, error) {
	// If given a model name, automatically create the right provider
	if params.ModelName != "" {
		provider, err := CreateAgentProvider(AgentProviderFactoryParams{
			ModelName: params.ModelName,
		})
		if err != nil {
			return models.LanguageModelOutput{}, err
		}
		params.Provider = provider
	}

	// Use the provider (we don't care which one!)
	return params.Provider.GenerateText(params.Prompt)
}
```

That's it! The caller doesn't need to know anything about OpenAI or how to create providers. They just pass a model name, and our factory handles the rest. 

This is the power of the **Provider Pattern** + **Factory Pattern** combination! 🎯

## The Power of This Design (Why You Should Care)

Let me show you why this architecture is so good:

### 1. **Extensibility** 
Want to add Google Gemini? Just create a new `GeminiProvider` struct, implement `GenerateText()`, and boom—it works with all existing code. No changes needed anywhere else!

### 2. **Testability** 
You can create a mock provider for testing. No need to call real APIs during tests:
```go
type MockProvider struct{ /* ... */ }
func (m MockProvider) GenerateText(prompt string) (models.LanguageModelOutput, error) {
	return models.LanguageModelOutput{Text: "test response"}, nil
}
```

### 3. **Separation of Concerns** 
OpenAI handles OpenAI details. Gemini handles Gemini details. Your main code doesn't care. Each provider is isolated.

### 4. **Flexible API**
Users can provide their own provider or use the factory. You're not forcing anyone into a box.

### 5. **Clean Code**
Look at how simple the calling code is! That's professional-grade design right there.

This is what real-world Go codebases look like. You're learning industry best practices! 🎓

## What's Next?

You've built a solid foundation! In the next part, we'll explore:

- **Part 2**: Streaming Responses—learning how to handle long-running AI tasks where responses come in chunks instead of all at once

More parts will be available in the future covering advanced topics like error handling, multiple providers, and building full agents! 🚀

## TL;DR (What You Just Learned)

- **Interfaces**: Define a contract that all providers must follow (`AgentProvider`)
- **Composition**: Use embedding to share code without inheritance (`AgentProviderImpl`)
- **Factory Pattern**: Hide complexity behind a simple function (`CreateAgentProvider()`)
- **Model Detection**: Smart routing based on model name ("gpt-5" → OpenAI)
- **Standardized Output**: Convert different APIs into one format users understand

You've now learned the pattern that's used in production SDKs everywhere. These aren't just theoretical concepts—they're practical tools for building real software! 💪

Next time you use a library, see if you can spot these patterns. Interfaces, factories, composition—once you know them, you'll see them everywhere.

Happy coding, and welcome to your Go journey! 🎉
