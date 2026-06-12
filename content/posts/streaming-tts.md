---
title: "Streaming Text-to-Speech: Making AI Chat feel more natural"
date: 2026-06-12T15:27:09+02:00
draft: false
---

Have you ever chatted with an AI and wished it could talk back in real-time without that awkward "thinking" pause? In this post, I'll walk you through how I built a low-latency streaming Text-to-Speech (TTS) system. The goal is simple: start playing the audio as soon as the first few words are generated, making the experience feel much more natural and responsive.

## 1. The Challenge: Killing the Latency

In traditional TTS systems, the entire text content must be available before synthesis begins. In a chat application where the AI "streams" its response (that cool typing effect), waiting for the full response to finish before starting TTS introduces significant latency—often several seconds.

To provide a seamless experience, we need a system that:

1.  **Starts synthesis** as soon as the first few words are available.
2.  **Continuously feeds** new text into the TTS engine as the AI generates it.
3.  **Streams audio chunks** back to the client for immediate playback.
4.  **Handles audio buffering** in the browser to prevent "glitches" or gaps in speech.

## 2. The Tech Stack: Web Audio & GCP

### AudioContext & AudioWorklet

The Web Audio API's `AudioContext` is our tool for managing the audio pipeline. To ensure high-performance, glitch-free audio playback, I'm using an **AudioWorklet**. Unlike the older `ScriptProcessorNode` which runs on the main UI thread, `AudioWorklet` runs in a separate low-priority thread, preventing UI interactions from causing audio stutters.

Support for `AudioWorklet` is now standard and stable in:

- Google Chrome & Microsoft Edge (Version 66+)
- Apple Safari (macOS and iOS 14.5+)
- Mozilla Firefox (Version 76+)

### GCP Streaming TTS (Bidirectional Data)

I use the Google Cloud Text-to-Speech `streamingSynthesize` API. This is a gRPC-based service that allows for bidirectional streaming:

- **Upstream**: We send `StreamingSynthesizeRequest` objects containing chunks of text as they appear in Firestore.
- **Downstream**: We receive `StreamingSynthesizeResponse` objects containing binary PCM audio data.

## 3. Let's Dive into the Implementation

### System Architecture

Here's a high-level view of how the data flows from the AI engine all the way to your speakers:

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant AI as AI Engine
    participant DB as Firestore
    participant FB as Firebase Function
    participant GCP as GCP TTS (gRPC)
    participant BR as Browser (Client)
    participant AW as AudioWorklet

    AI->>DB: Stream Text Chunks
    FB->>DB: Monitor Changes
    DB-->>FB: New Text Content
    FB->>GCP: StreamingSynthesizeRequest (Text)
    GCP-->>FB: StreamingSynthesizeResponse (PCM)
    FB->>BR: HTTP Chunked Stream (Audio)
    BR->>AW: postMessage (Audio Chunks)
    AW->>AW: Queue Buffering
    AW-->>BR: Real-time Audio Playback
```

### Backend Synthesis: The Conductor

The Firebase function acts as the orchestrator. It establishes a gRPC stream with GCP, monitors the Firestore document for changes in the AI's response, and streams the synthesized audio back to the client.

```typescript
// 1. Initialize synthesis stream and handle chunk delivery
const { processInput, endStream } = await streamTts({
  onChunkReady: (chunk) => {
    // Send binary PCM chunk to client via HTTP stream
    response.sendChunk(chunk);
  },
  onEnded: () => {
    // Signal end of audio stream to client
    response.sendChunk({ type: "signal", event: "end" });
  },
});

// 2. Signal start of synthesis to client
response.sendChunk({ type: "signal", event: "start-synthesis" });

// 3. Monitor Firestore for new content while the message is "Generating"
while (true) {
  const { newContent, noNewContent } = receiveNewContent();

  if (newContent) {
    // Feed new text fragments to GCP as they arrive
    await processInput(newContent);
  }

  if (noNewContent) {
    endStream();
    break;
  }
}
```

### Audio Processing Worklet (`pcm-processor.js`)

The `PCMProcessor` is the heart of the client-side playback. It maintains a queue of incoming audio chunks and ensures that the `AudioContext` always has samples to play by pulling from the queue during each process cycle.

```javascript
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];

    if (this.bufferQueue.length === 0) {
      channel.fill(0); // Play silence if buffer is empty
      return true;
    }

    let chunk = this.bufferQueue[0];
    // Copy chunk data to output buffer and manage queue...
    channel.set(chunk.subarray(0, channel.length));
    this.bufferQueue[0] = chunk.subarray(channel.length);

    return true;
  }
}
```

### The Client Pipeline (`browser-audio.ts`)

This helper script sets up the connection between the `AudioWorklet` and a `MediaStreamDestination`. This allows the generated audio to be used like any other media stream in your app.

```typescript
export async function createCustomAudioStream(sampleRate: number) {
  const audioContext = new AudioContext({ sampleRate });
  await audioContext.audioWorklet.addModule("/pcm-processor.js");

  const pcmNode = new AudioWorkletNode(audioContext, "pcm-processor");
  const streamDestination = audioContext.createMediaStreamDestination();

  pcmNode.connect(streamDestination);
  return {
    customStream: streamDestination.stream,
    writeChunk: (data: Float32Array) => pcmNode.port.postMessage(data),
  };
}
```

### Putting it all together: The Orchestration Hook (`useChatTts.ts`)

The `useChatTts` hook is where the magic happens. It watches for new messages, calls our Firebase function, and pipes the resulting stream of bytes directly into the audio worklet.

```typescript
for await (const chunk of stream) {
  if (chunk.type === "signal") {
    // Handle special signals (like end of stream)
    if (chunk.event === "end") {
      writeEndSequence(); // Signal the worklet to finish up
    }
  } else {
    const uint8Array = Uint8Array.from(chunk.data);
    writeUint8AudioChunk(uint8Array); // Push to our buffering store
  }
}
```

## 4. A Few Pro-Tips (Key Considerations)

- **Normalization**: Binary PCM data from GCP typically comes as 16-bit signed integers. You'll need to convert these to 32-bit floats (in the range of -1.0 to 1.0) before the Web Audio API can use them.
- **End of Stream**: I used a special bit sequence (`END_SEQUENCE`) to signal the `AudioWorklet` that the AI has finished talking. This lets it gracefully close the `AudioContext` without any pops or clicks.
- **Smart Buffering**: The `PCMProcessor` is designed to handle small hiccups in network latency by maintaining a local buffer queue. It’s a lifesaver for keeping the speech smooth!

And there you have it! A fully functional, low-latency streaming TTS system that makes AI interactions feel just a little more human. Happy coding!
