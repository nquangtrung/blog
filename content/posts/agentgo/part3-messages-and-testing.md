---
title: 
How to Make an AI SDK Clone in Golang - Part 3 - Messages & Unit Testing
date: 2026-08-10T14:41:31+02:00
draft: false
---

![image](https://firebasestorage.googleapis.com/v0/b/trontria-blog.appspot.com/o/part3-messages-and-testing%2Fpart3-messages-and-testing.webp?alt=media&token=327102e5-566d-422c-b6d0-6a7889dc665c)

Welcome back! 👋 In Part 1 and Part 2, we built the core of our AI SDK—generating and streaming text responses. But here's what makes modern AI truly powerful: **multi-turn conversations**. Imagine building ChatGPT—you need to remember what the user said, what the assistant replied, and maintain context across dozens of turns.

In this part, we'll explore:
1. **Messages**: How to structure and pass conversation context to LLMs
2. **Unit Testing in Go**: Using `testing`, `gomock`, `mock-gen`, and `testify` to test our code without hitting real APIs

By the end, you'll understand how multi-turn conversations work and how to test them properly. Let's go! 🚀

**📌 All the code from this blog is available on GitHub: https://github.com/nquangtrung/agentgo**

---

## Part 1: Messages

### The Challenge: Context Matters

When you chat with ChatGPT, it remembers your entire conversation history. Here's why:

```
Turn 1:
User: "My name is Alice"
ChatGPT: "Nice to meet you, Alice!"

Turn 2:
User: "What's my name?"
ChatGPT: "Your name is Alice!"  ← It remembered!
```

If ChatGPT only looked at the current prompt ("What's my name?"), it wouldn't know the answer. It needs the **entire history**.

This is where **Messages** come in. Before sending a prompt to the LLM, we build a list of all previous messages and send them together.

### The Message Data Structure

Every message in the conversation has a **role** and **content**:
1. **Role**: Who said it? (human, assistant, or system)
2. **Content**: What did they say? (text)

Here's how we model it in Go:

```go
type MessageRole string

const (
	MessageRoleHuman     MessageRole = "human"
	MessageRoleAssistant MessageRole = "assistant"
	MessageRoleSystem    MessageRole = "system"
)

type Message interface {
	GetType() MessageRole
	GetContent() MessageContentImpl
}

type MessageImpl struct {
	messageRole MessageRole
	content     MessageContentImpl
}

type MessageContentImpl struct {
	text string
}

func NewHumanStringMessage(content string) Message {
	return NewStringMessage(MessageRoleHuman, content)
}

func NewAssistantStringMessage(content string) Message {
	return NewStringMessage(MessageRoleAssistant, content)
}

func NewSystemStringMessage(content string) Message {
	return NewStringMessage(MessageRoleSystem, content)
}
```

Notice the elegant design here:
- **Interface-based**: `Message` is an interface, so we can extend it later with tool calls or other features
- **Simple content model**: Each message has a role and text content
- **Factory functions**: Clean ways to create different message types with `NewHumanStringMessage()`, `NewAssistantStringMessage()`, etc.
- **This mirrors real APIs**: OpenAI, Claude, and Gemini all use this pattern!

### Using Messages: The Params Pattern

The key to passing messages through our SDK is the `Params` struct:

```go
type Params struct {
	Provider     providers.AgentProvider
	Prompt       string
	ModelName    string
	Messages     []models.Message  // ← The conversation history!
	Tools        []models.Tool
	MaxToolSteps int
}
```

Notice:
- `Prompt` is for simple text input (one-shot prompting)
- `Messages` is for conversation history (multi-turn) ← **This is what we focus on!**
- You can use either or both!

### Building a Multi-Turn Conversation

Here's how you build a conversation that grows:

```go
messages := []models.Message{}

// Turn 1: User asks a question
messages = append(messages, models.NewHumanStringMessage(
	"What's 47 × 13?",
))

// Send to LLM
output, _ := agentgo.GenerateText(agentgo.Params{
	Messages:  messages,
	ModelName: "gpt-5-mini",
})

// Add assistant response
messages = append(messages, models.NewAssistantStringMessage(
	output.Text,  // "The answer is 611"
))

// Turn 2: User asks a follow-up
messages = append(messages, models.NewHumanStringMessage(
	"Multiply that by 2",
))

// Send full history to LLM
output, _ = agentgo.GenerateText(agentgo.Params{
	Messages:  messages,  // ← Full history included!
	ModelName: "gpt-5-mini",
})

// LLM sees: previous question, answer, and new question
// So it knows what "that" refers to! ✅
```

The magic: **Each call includes the full message history**. The LLM can see previous turns and maintain context. This is how real chatbots work! 💬

### System Messages

System messages are special—they set the AI's behavior and personality:

```go
messages := []models.Message{
	// System message first (sets the tone)
	models.NewSystemStringMessage(
		"You are a helpful math tutor. Explain your reasoning step-by-step.",
	),
	// Then the conversation
	models.NewHumanStringMessage("What's 47 × 13?"),
}

output, _ := agentgo.GenerateText(agentgo.Params{
	Messages:  messages,
	ModelName: "gpt-5-mini",
})
```

The LLM follows the system instruction, making it more consistent and aligned with what you want. 🎯

### Streaming with Messages

`StreamText` also accepts message history:

```go
output := agentgo.StreamText(agentgo.Params{
	Messages:  messages,
	ModelName: "gpt-5-mini",
})

// Iterate over parts as they arrive
for part := range output.Stream {
	switch part.GetType() {
	case models.PartTypeText:
		textPart := part.(models.TextPart)
		fmt.Print(textPart.Text)  // Stream text to UI
	case models.PartTypeEnd:
		fmt.Println("\nDone!")
	}
}
```

Same interface, same multi-turn capabilities, but with streaming instead of waiting for the full response! Perfect for interactive UIs. ✨

---

## Part 2: Unit Testing - The Right Way

Now here's the hard truth: **If you're calling real APIs during tests, you're doing it wrong.** ❌

Real APIs are:
- **Slow** (might take seconds per call)
- **Unreliable** (rate limits, network issues)
- **Expensive** (you pay for every call!)
- **Non-deterministic** (different responses each time)

That's why we **mock** them. In Go, mocking is simple and elegant thanks to interfaces and tools like `gomock` and `testify`.

### The Power of Interfaces for Testing

Remember our `AgentProvider` interface from Part 1?

```go
type AgentProvider interface {
	GetContext() models.LanguageModelContext
	GenerateText(params AgentProviderGenerateTextParams) (models.LanguageModelOutput, error)
	StreamText(params AgentProviderStreamTextParams, channel chan<- models.Part) error
}
```

This interface is **perfect for testing** because we can create a mock implementation:

```go
type MockProvider struct {
	GenerateTextFunc func(params AgentProviderGenerateTextParams) (models.LanguageModelOutput, error)
	StreamTextFunc   func(params AgentProviderStreamTextParams, channel chan<- models.Part) error
}

func (m MockProvider) GetContext() models.LanguageModelContext {
	return models.LanguageModelContext{ModelName: "test-model"}
}

func (m MockProvider) GenerateText(params AgentProviderGenerateTextParams) (models.LanguageModelOutput, error) {
	return m.GenerateTextFunc(params)
}

func (m MockProvider) StreamText(params AgentProviderStreamTextParams, channel chan<- models.Part) error {
	return m.StreamTextFunc(params, channel)
}
```

But this is manual and error-prone. What if we add new methods to the interface? We have to update the mock. Let's use a better tool.

### Enter GoMock: Automatic Mocking

**GoMock** uses Go's `go generate` command to automatically create mocks from interfaces. No manual mock writing!

First, install `mockgen`:

```bash
go install github.com/golang/mock/mockgen@latest
```

Then add this comment to your interface definition (it's already there in the code):

```go
//go:generate mockgen -destination=../mocks/mock_agent_provider.go -package=mocks trontria.com/agentgo/providers AgentProvider
type AgentProvider interface {
	GetContext() models.LanguageModelContext
	GenerateText(params AgentProviderGenerateTextParams) (models.LanguageModelOutput, error)
	StreamText(params AgentProviderStreamTextParams, channel chan<- models.Part) error
}
```

Now run:

```bash
go generate ./...
```

This creates `mocks/mock_agent_provider.go` with a complete mock implementation! No manual work. ✨

### Understanding go:generate

The `go generate` command reads special comments in your code and runs tools. Here's what's happening:

```
//go:generate mockgen -destination=../mocks/mock_agent_provider.go -package=mocks trontria.com/agentgo/providers AgentProvider
```

Breaking it down:
- `mockgen`: The tool to run
- `-destination=../mocks/mock_agent_provider.go`: Output file path
- `-package=mocks`: Package name for generated code
- `trontria.com/agentgo/providers`: Import path of the package
- `AgentProvider`: Interface name

When you run `go generate ./...`, it:
1. Finds all `//go:generate` comments
2. Runs each command
3. Creates/updates the generated files

This is Go's built-in way to automate code generation. Very elegant! 🎨

### Testing with Mocks: GenerateText Example

Here's a simplified version of the real test from the codebase:

```go
func TestGenerateText(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockProvider := mocks.NewMockAgentProvider(ctrl)

	// Set up mock expectations
	mockProvider.EXPECT().GetContext().AnyTimes().Return(models.LanguageModelContext{
		ModelName: "test-llm",
	})

	mockProvider.EXPECT().GenerateText(gomock.Any()).Return(
		models.LanguageModelOutput{
			Text: "This is a test",
			Usage: models.LanguageModelUsage{InputTokens: 245},
		},
		nil,
	)

	// Call SDK and assert
	output, err := agentgo.GenerateText(agentgo.Params{
		Prompt:   "Say this is a test",
		Provider: mockProvider,
	})

	assert.NoError(t, err)
	assert.Equal(t, output.Text, "This is a test")
	assert.Equal(t, output.Usage.InputTokens, 245)
}
```

Key concepts:

- **EXPECT()**: Set up mock behavior
- **AnyTimes()**: Can be called multiple times
- **Return()**: What the mock returns
- **assert**: Verify results without real API calls ⚡

### Using Testify for Assertions

Testify makes assertions cleaner and more readable. Here's an example from the Part tests:

```go
func TestTextPart(t *testing.T) {
	context := models.LanguageModelContext{
		ModelName: "mocked-llm",
	}
	part := models.NewTextPart(context, "hello world")

	// Test AsTextPart conversion
	p, ok := part.AsTextPart()
	assert.True(t, ok, "should be able to convert to text part")
	assert.NotNil(t, p, "should be able to access converted text part")
	assert.Equal(t, p.GetText(), "hello world", "should have correct text")
	assert.Equal(t, p.GetType(), models.PartTypeText, "should have correct part type")

	// Test that other conversions fail
	_, ok = part.AsStepStartPart()
	assert.False(t, ok, "should not be able to convert text part to step start")
}
```

Testify assertions are:
- **Readable**: `assert.Equal()` is clearer than `if x != y { t.Fatalf(...) }`
- **Informative**: Testify shows helpful diffs on failure
- **Concise**: Much less boilerplate

Here are the most useful ones:

```go
assert.Equal(a, b)           // Check equality
assert.NotEqual(a, b)        // Check inequality
assert.True(condition)       // Assert boolean is false
assert.False(condition)      // Assert boolean is false
assert.Nil(value)            // Assert value is nil
assert.NotNil(value)         // Assert value is not nil
assert.ElementsMatch(a, b)   // Assert slice contains same elements (any order)
assert.Error(err)            // Assert error is not nil
assert.NoError(err)          // Assert error is nil
```

### Testing Streaming with Mocks

Here's a simplified version of the `StreamText` test:

```go
func TestStreamText(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockProvider := mocks.NewMockAgentProvider(ctrl)
	mockProvider.EXPECT().GetContext().Return(models.LanguageModelContext{
		ModelName: "test-llm",
	})

	// Mock sends streaming parts
	mockProvider.EXPECT().StreamText(gomock.Any(), gomock.Any()).Do(
		func(_ providers.AgentProviderStreamTextParams, channel chan models.Part) {
			ctx := models.LanguageModelContext{ModelName: "test-llm"}
			channel <- models.NewTextPart(ctx, "Hello ")
			channel <- models.NewTextPart(ctx, "World!")
			close(channel)
		},
	)

	// Collect streamed text
	output := agentgo.StreamText(agentgo.Params{
		Prompt:   "Say hello",
		Provider: mockProvider,
	})

	var texts []string
	for part := range output.Channel {
		if p, ok := part.AsTextPart(); ok {
			texts = append(texts, p.GetText())
		}
	}

	assert.ElementsMatch(t, texts, []string{"Hello ", "World!"})
}
```

Key concepts:

- **Do()**: Custom mock behavior
- **Part type conversion**: Use `AsTextPart()` to safely convert parts
- **ElementsMatch()**: Assert multiple items without caring about order
- No real network—millisecond execution! ⚡

### The Testing Workflow

Here's the complete workflow:

```bash
# 1. Ensure mockgen is installed
go install github.com/golang/mock/mockgen@latest

# 2. Generate mocks (already have //go:generate comments)
go generate ./...

# 3. Write tests using mocks
# (Edit your *_test.go files)

# 4. Run tests
go test ./... -v

# 5. Check coverage
go test ./... -cover

# 6. Run with verbose output
go test ./... -v -race
```

Your tests should run in **milliseconds**, not seconds. That's the power of mocking!

### Go's Testing Philosophy

Go's testing approach is beautifully simple:

1. **No special framework required** — just `import "testing"`
2. **Interfaces enable mocking** — any interface can be mocked
3. **GoMock automates the mocks** — no manual code
4. **Testify makes assertions clean** — readable, informative
5. **Run with `go test`** — standard command everyone knows

This is why Go code tends to be well-tested—the barriers are low! 🎉

---

## Best Practices for Messages

### 1. **Always Include System Messages When Setting Behavior**

```go
// ❌ Bad: No system message
messages := []models.Message{
	models.NewHumanStringMessage("Translate to Spanish"),
	// LLM might respond in English or Spanish—unpredictable!
}

// ✅ Good: Clear system instruction
messages := []models.Message{
	models.NewSystemStringMessage("You are a Spanish translator. Always respond in Spanish."),
	models.NewHumanStringMessage("Translate to Spanish: Hello"),
	// LLM will reliably respond in Spanish
}
```

### 2. **Build Messages Incrementally**

```go
// ✅ Good: Add messages one turn at a time
messages := []models.Message{}

for {
	userInput := getUserInput()
	messages = append(messages, models.NewHumanStringMessage(userInput))
	
	response, _ := agentgo.GenerateText(agentgo.Params{
		Messages:  messages,
		ModelName: "gpt-5-mini",
	})
	
	messages = append(messages, models.NewAssistantStringMessage(response.Text))
}
```

### 3. **Keep Message History Reasonable**

```go
// ⚠️ Watch out: Very long conversations consume tokens
if len(messages) > 100 {
	// Consider summarizing old messages or starting fresh
	messages = messages[len(messages)-20:]  // Keep last 20 messages
}
```

### 4. **Test with Different Message Histories**

```go
// Test empty history (first message)
output1, _ := agentgo.GenerateText(agentgo.Params{
	Messages:  []models.Message{},
	ModelName: "gpt-5-mini",
})

// Test with history (multi-turn)
messages := []models.Message{...}
output2, _ := agentgo.GenerateText(agentgo.Params{
	Messages:  messages,
	ModelName: "gpt-5-mini",
})
```

---

## What's Next?

You've now learned:
- **Messages**: How to structure multi-turn conversations
- **The Params Pattern**: How to pass message history to the SDK
- **GoMock**: Auto-generating mocks from interfaces
- **go generate**: Go's command for code generation
- **Testify**: Clean, readable assertions
- **Testing Strategy**: Testing without hitting real APIs

These are production-grade patterns! Real AI companies use exactly this approach.

## TL;DR (What You Just Learned)

- **Messages are the foundation**: Role + content make up conversations
- **Message interface**: Extensible design lets us add features later
- **Factory functions**: `NewHumanStringMessage()`, `NewAssistantStringMessage()`, etc.
- **Params struct**: Pass messages to `GenerateText()` and `StreamText()`
- **Message history**: Each call includes full history for context
- **System messages**: Set AI behavior and personality
- **Interfaces = Testability**: Provider interface lets us mock easily
- **GoMock**: Auto-generates mocks from interfaces using `go generate`
- **Expectations**: Set up what mocks should do with `.EXPECT()`
- **Testify**: Write clean assertions with `assert.Equal()`, `assert.NoError()`, etc.
- **No API Calls in Tests**: Tests run in milliseconds, not seconds
- **Production Ready**: This is how real SDKs are tested!

Next part will cover:
- **Tool Calling**: How AI can call functions and take actions
- **Tool Definitions**: Strongly-typed tools
- **The Agent Loop**: Multi-step reasoning with tool calls

You're building real, professional AI SDK skills! Happy coding! 🚀
