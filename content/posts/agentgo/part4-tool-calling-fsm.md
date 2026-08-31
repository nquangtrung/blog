---
title: "How to Make an AI SDK Clone in Golang - Part 4 - Tool Calling Loops with FSM"
date: 2026-08-30T11:12:18+02:00
draft: false
---

![image](https://firebasestorage.googleapis.com/v0/b/trontria-blog.appspot.com/o/part4-tool-calling-fsm%2Fagentgo-part4.webp?alt=media&token=745dc773-2274-426e-9ead-4b38b6f4ec7c)

Welcome back! 👋 We're at the exciting part now. In Parts 1-3, we built the foundations: generating text, streaming responses, and managing conversations. But here's the real magic that makes AI **agentic**—**tool calling**.

Imagine an AI that doesn't just generate text. It can:
- 🛠️ Call functions (tools)
- 📊 Process the results
- 🔄 Loop until the task is complete
- ✅ Make decisions at each step

This is what turns a simple chatbot into an intelligent agent. But here's the problem: **How do you structure tool-calling loops cleanly?**

In earlier iterations, I tried simple `for` loops with end conditions. It was messy, hard to extend, and difficult to reason about. **Then I remembered FSM (Finite State Machine)**, and everything changed.  
🚀
**📌 All the code from this blog is available off GitHub: https://github.com/nquangtrung/agentgo**

---

## The Problem: Why Tool-Calling Loops Are Hard

Let's say you want to build an agent that can:

1. Receive a user request
2. Ask the LLM what to do
3. If the LLM says "call this tool," execute it
4. Pass the result back to the LLM
5. Repeat until the LLM says "I'm done"

Sounds simple, right? But when you code it with a `for` loop, things get messy quickly:

```go
// ❌ Bad: Complicated loop logic
for step := 0; step < maxSteps; step++ {
	// Check end conditions?
	if shouldEnd(archive) { break }
	
	// Call LLM
	output, err := llm.Call(messages)
	if err != nil { return err }
	
	// Parse tool calls?
	toolCalls := parseToolCalls(output)
	
	// Execute tools?
	for _, tool := range toolCalls {
		result := executeTool(tool)
		// Add to messages?
		messages = append(messages, result)
	}
	
	// Did we generate text? Should we stop?
	if output.HasText && !output.HasToolCall {
		break
	}
	
	// How many states are we in? This is getting confusing...
}
```

Problems:
- **Confusing state logic**: Are we in "tool resolution"? "Text generation"? Hard to tell.
- **Spaghetti code**: Loop condition logic mixes with tool execution logic mixes with message handling
- **Hard to extend**: Want to add streaming? Add logging? Add state validation? Good luck!
- **Difficult to test**: Mock what? The whole loop? Individual loop iterations?
- **Implicit state**: The current "phase" is determined by complex conditionals, not explicit states

This is where **FSM** shines. ✨

---

## Introducing FSM: Clarity Through States

**FSM = Finite State Machine**. It's a pattern where your program is always in exactly one of several **well-defined states**, and transitions between them are explicit.

Think of it like a traffic light:
- 🔴 Red state: Stop
- 🟡 Yellow state: Prepare to stop
- 🟢 Green state: Go

Each state knows what to do, and how to transition to the next state. Simple, clear, easy to reason about.

For our tool-calling loop, here are the states:

```
StartState
    ↓
StepStartState (emit event: step started)
    ↓
PredicateState (check: should we continue?)
    ├─→ ToolResolveState (call LLM, get tool calls, execute tools)
    │       ↓
    │   StepEndState (accumulate step results)
    │       ↓
    │   [Back to StepStartState] ← Loop!
    │
    └─→ PrepareTextGenerationState (decide: stream or single call?)
            ├─→ TextGenerationState (single response)
            │       ↓
            │   AfterTextGenerationState
            │       ↓
            │   StepEndState
            │       ↓
            │   EndState ✅
            │
            └─→ TextStreamState (streaming response)
                    ↓
                EndState ✅
```

Each state is a separate piece of code. Each state decides "what's the next state?" Clear, explicit, testable! 🎯

---

## The FSM Core: Simple and Elegant

The entire FSM engine is ~20 lines:

```go
type State[T any] interface {
	Execute(ctx context.Context, fsmCtx *T) (State[T], error)
}

type FSM[T any] struct {
	currentState State[T]
}

func (fsm *FSM[T]) Run(ctx context.Context, initialState State[T], fsmCtx *T) error {
	fsm.currentState = initialState
	for fsm.currentState != nil {
		if err := ctx.Err(); err != nil {
			return err
		}
		nextState, err := fsm.currentState.Execute(ctx, fsmCtx)
		if err != nil {
			return err
		}
		fsm.currentState = nextState
	}
	return nil
}
```

**That's it!** Just states returning states. No complex state tables, no reflection magic. When a state returns `nil`, the loop exits gracefully. 

---

## AgentContext: The Shared State

All states need access to shared data (messages, tool results, token usage, etc.). We pass this through the FSM context:

```go
type AgentContext struct {
	// Accumulated tool execution results
	ToolExecutionsArchive *models.ToolExecutionsArchive
	
	// Growing message history
	Messages *[]models.Message
	
	// Did we generate final text?
	TextGenerated bool
	
	// Track each step
	Steps       []Step
	CurrentStep Step
	
	// Token usage tracking
	TotalUsage models.LanguageModelUsage
}

type Step struct {
	StepIndex int
	Usage     models.LanguageModelUsage
}
```

Notice: **Shared state is explicit**. No hidden variables, no implicit state modifications. Everything flows through `AgentContext`. 📋

---

## Walking Through the States

Let's see how each state works. I'll show the key ones:

### 1. StartState: Initialization

```go
func (s *StartState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	emitter := ctx.Value(models.PartEmitterContextKey).(*models.PartEmitter)
	provider := ctx.Value(models.ProviderContextKey).(providers.AgentProvider)

	emitter.Emit(models.NewProcessStartPart(provider.Context()))
	fsmCtx.TotalUsage = models.LanguageModelUsage{}

	return &StepStartState{}, nil
}
```

Initialize context, emit event, move to next state.

### 2. StepStartState: Mark Step Boundary

```go
func (s *StepStartState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	provider := ctx.Value(models.ProviderContextKey).(providers.AgentProvider)
	emitter := ctx.Value(models.PartEmitterContextKey).(*models.PartEmitter)
	
	emitter.Emit(models.NewStepStartPart(provider.Context(), "step"))
	fsmCtx.CurrentStep = Step{StepIndex: len(fsmCtx.Steps) + 1}
	fsmCtx.Steps = append(fsmCtx.Steps, fsmCtx.CurrentStep)

	return &PredicateState{}, nil
}
```

Emit event, track step, move to decision point.

### 3. PredicateState: The Decision Point ⚡

```go
func (s *PredicateState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	endConds := ctx.Value(models.EndConditionsContextKey).([]models.EndCondition)
	tools := ctx.Value(models.ToolsContextKey).([]models.BaseTool)

	switch {
	case fsmCtx.TextGenerated:
		return &StepEndState{toEnd: true}, nil
	case len(endConds) == 0 || len(tools) == 0:
		return &PrepareTextGenerationState{}, nil
	case canProceedToNextStep(fsmCtx.ToolExecutionsArchive, endConds):
		return &ToolResolveState{}, nil
	default:
		return &StepEndState{toEnd: true}, nil
	}
}
```

The heart of the loop! Clear decision rules, each path returns a specific state.

### 4. ToolResolveState: Execute Tool Calls

```go
func (s *ToolResolveState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	provider := ctx.Value(models.ProviderContextKey).(providers.AgentProvider)
	tools := ctx.Value(models.ToolsContextKey).([]models.BaseTool)
	emitter := ctx.Value(models.PartEmitterContextKey).(*models.PartEmitter)

	// Resolve and execute tool calls
	toolCalls, _ := provider.ResolveToolCall(ctx, 
		providers.AgentProviderPromptMessageParams{Messages: *fsmCtx.Messages}, tools)

	if len(toolCalls) == 0 {
		return &PrepareTextGenerationState{}, nil
	}

	for _, call := range toolCalls {
		emitter.Emit(models.NewToolStartPart(provider.Context(), call.ToolName))
		result, _ := executeToolCall(ctx, call, tools)
		emitter.Emit(models.NewToolResultPart(provider.Context(), call.ToolName, *result))
		models.AccumulateToolCallResult(fsmCtx.ToolExecutionsArchive, result, fsmCtx.Messages)
	}

	return &StepEndState{}, nil
}
```

Ask LLM for tools → execute them → accumulate results → move on.

### 5. StepEndState: Step Completion & Loop Decision

```go
func (s *StepEndState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	provider := ctx.Value(models.ProviderContextKey).(providers.AgentProvider)
	emitter := ctx.Value(models.PartEmitterContextKey).(*models.PartEmitter)
	
	emitter.Emit(models.NewStepEndPart(provider.Context(), "step", fsmCtx.CurrentStep.Usage))
	fsmCtx.TotalUsage = models.AccumulateUsage(fsmCtx.TotalUsage, fsmCtx.CurrentStep.Usage)

	if s.toEnd {
		return &EndState{}, nil
	}
	return &StepStartState{}, nil  // Loop back!
}
```

**The loop happens here!** `toEnd: false` goes back to `StepStartState`.

### 6. EndState: Cleanup

```go
func (s *EndState) Execute(ctx context.Context, fsmCtx *AgentContext) (State[AgentContext], error) {
	emitter := ctx.Value(models.PartEmitterContextKey).(*models.PartEmitter)
	provider := ctx.Value(models.ProviderContextKey).(providers.AgentProvider)

	emitter.Emit(models.NewProcessEndPart(provider.Context(), fsmCtx.TotalUsage, models.FinishReasonCompleted))
	return nil, nil  // Return nil → FSM loop exits
}
```

Return `nil` state to signal FSM termination.

---

## How It All Works Together: The State Machine Diagram

![image](https://firebasestorage.googleapis.com/v0/b/trontria-blog.appspot.com/o/part4-tool-calling-fsm%2Fagentgo-fsm.webp?alt=media&token=e34cedb6-fcee-4d28-b6a6-be8fe8ad68ea)

Notice the structure:
- **Starting phase**: `StartState` → `StepStartState` → `PredicateState`
- **Tool-calling loop**: `ToolResolveState` → `StepEndState_Loop` → back to `StepStartState` (the `toEnd: false` path)
- **Text generation branches**: Either single call or streaming, both lead to `EndState`
- **Exit paths**: All paths eventually reach `EndState`, which returns `nil`
- **Clean FSM exit**: When `EndState` returns `nil` state, the `for fsm.currentState != nil` loop terminates

---

## Why FSM Is Better: A Comparison

### Before (Loop with Conditions):
```go
for step := 0; step < maxSteps; step++ {
	if shouldEnd(archive) { break }
	toolCalls := resolveTool()
	if len(toolCalls) == 0 { break }
	for _, call := range toolCalls { executeTool(call) }
	if someCondition { break }
}
```

**Problems**: Unclear state, implicit transitions, hard to extend, difficult to test.

### After (FSM):
```go
fsm := fsm.New[AgentContext]()
err := fsm.Run(ctx, &StartState{}, &agentContext)
```

**Benefits**: Each state is clear, transitions are explicit, easy to test individually.

---

## Testing States: The Power of FSM

```go
func TestToolResolveState(t *testing.T) {
	ctx := context.Background()
	ctx = context.WithValue(ctx, models.ProviderContextKey, mockProvider)
	ctx = context.WithValue(ctx, models.ToolsContextKey, mockTools)
	
	fsmCtx := &fsm.AgentContext{
		Messages:              &[]models.Message{},
		ToolExecutionsArchive: &models.ToolExecutionsArchive{},
	}
	
	state := &fsm.ToolResolveState{}
	nextState, err := state.Execute(ctx, fsmCtx)
	
	assert.NoError(t, err)
	assert.IsType(t, &fsm.StepEndState{}, nextState)
}
```

Mock context, test individual states, no network calls. Fast, simple, isolated. ✅

---

## End Conditions: Stopping the Loop

Control when the loop stops with **end conditions**:

```go
endConditions := []models.EndCondition{
	{Condition: func(archive *ToolExecutionsArchive) bool {
		return len(archive.ToolCalls) >= 10  // Max 10 calls
	}},
	{Condition: func(archive *ToolExecutionsArchive) bool {
		// Stop if specific tool was called
		for _, call := range archive.ToolCalls {
			if call.ToolName == "finish" { return true }
		}
		return false
	}},
}
```

Pass to `PredicateState`, which checks them. Easy to add new stopping criteria! 💡

---

## Production Usage: Real Agent Loop

```go
func RunAgent(ctx context.Context, params AgentParams) error {
	fsm := fsm.New[fsm.AgentContext]()
	
	agentCtx := &fsm.AgentContext{
		Messages:              &params.Messages,
		ToolExecutionsArchive: &models.ToolExecutionsArchive{},
	}
	
	ctx = context.WithValue(ctx, models.ProviderContextKey, params.Provider)
	ctx = context.WithValue(ctx, models.ToolsContextKey, params.Tools)
	ctx = context.WithValue(ctx, models.EndConditionsContextKey, params.EndConditions)
	ctx = context.WithValue(ctx, models.PartEmitterContextKey, params.Emitter)
	
	return fsm.Run(ctx, &StartState{}, agentCtx)
}
```

That's it! FSM handles the entire tool-calling loop. ✨

---

## What Makes FSM Superior for Tool Calling

### 1. **Explicit State Transitions**
Every state explicitly declares what comes next. No implicit loop conditions. Compare:

```go
// ❌ Loop: Unclear when we stop
for step := 0; step < 100; step++ {
	// Are we done? Check these 5 conditions...
	if cond1 || (cond2 && !cond3) || cond4 { break }
}

// ✅ FSM: Crystal clear
case fsmCtx.TextGenerated:
	return &StepEndState{toEnd: true}, nil
```

### 2. **Single Responsibility**
Each state does one thing:
- `ToolResolveState`: Resolve and execute tools
- `TextGenerationState`: Generate final response
- `PredicateState`: Make decisions
- `StepEndState`: Bookkeeping and decide to loop or end

Not one giant loop doing everything!

### 3. **Extensibility**
Want to add a new state (like `ValidationState` to check tool results)? Just create it and insert it in the transition chain. Existing states don't change!

### 4. **Debuggability**
Logs tell you exactly which state you're in:
```
Starting FSM with initial state: *fsm.StartState
Executing state: *fsm.StartState
Executing state: *fsm.StepStartState
Executing state: *fsm.PredicateState
Executing state: *fsm.ToolResolveState
Executing state: *fsm.StepEndState
Executing state: *fsm.StepStartState  ← Loop!
...
```

Compare to a loop where you can't easily tell what phase you're in.

### 5. **Testability**
Mock the context, test individual states. No need to set up the entire "loop scenario." Tests run in milliseconds.

---

## The Evolution: Why I Chose FSM

I initially tried:
1. **Simple loop** ❌ Too messy
2. **Loop with state tracking** ❌ State tracking logic leaked everywhere
3. **Nested switch statements** ❌ Spaghetti code
4. **FSM** ✅ Perfect!

FSM forces you to **think clearly** about your workflow. Each state asks:
- "What should I do?"
- "What information do I need?"
- "What's the next step?"

This clarity pays off in maintainability, extensibility, and correctness. 🎯

---

## Key Takeaways: FSM for Tool Calling

1. **FSM replaces loop complexity**: Each state is explicit, testable, and clear
2. **Shared context via AgentContext**: All states access shared data through one struct
3. **State transitions are explicit**: `return &NextState{}, nil` makes it obvious
4. **End conditions are extensible**: Add new stopping criteria without changing FSM logic
5. **Loop happens in state transitions**: `StepEndState` decides to go back to `StepStartState`
6. **Error handling is clean**: Each state can fail independently, FSM stops
7. **Testing is simple**: Mock context, test individual states
8. **Debugging is easy**: Log shows exact state sequence

---

## What's Next?

You've now learned:
- **FSM basics**: States and transitions
- **Tool-calling loop**: How to structure multi-step agent reasoning
- **State design**: Single responsibility, explicit transitions
- **Context passing**: How to share data between states
- **End conditions**: How to stop the loop
- **Production patterns**: Real-world agent implementation

## TL;DR (What You Just Learned)

- **Problem**: Tool-calling loops with conditionals are messy
- **Solution**: FSM (Finite State Machine) makes state explicit
- **FSM basics**: States return States, loop until nil
- **Key states**: 
  - `StartState`: Initialize
  - `StepStartState`: Create step
  - `PredicateState`: Decide path (tools vs. text vs. end)
  - `ToolResolveState`: Call tools, execute
  - `PrepareTextGenerationState`: Choose streaming mode
  - `TextGenerationState`/`TextStreamState`: Generate response
  - `StepEndState`: Bookkeeping, decide to loop or end
  - `EndState`: Cleanup, return nil
- **Loop mechanism**: `StepEndState{toEnd: false}` returns to `StepStartState`
- **End conditions**: Extensible predicates that stop the loop
- **Benefits**:
  - Explicit state transitions
  - Easy to test (state by state)
  - Easy to extend (add new states)
  - Clear to debug (state logs)
  - Maintainable (single responsibility)

FSM is the pattern that separates **prototype code** from **production code**. Once you use it, you'll wonder how you ever lived without it! 🚀

Next parts will cover:
- **Part 5**: Advanced patterns (error recovery, state validation, custom state logic)
- **Part 6**: Real-world examples (building specific agent types)
- More to come! 🎉

Happy coding, and welcome to the world of stateful agent systems! 💪
