import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper over the Anthropic SDK tuned for an unattended CLI run:
 * streaming (long thinking turns exceed non-streaming HTTP timeouts),
 * aggressive retries, prompt caching on the stable prefix, and usage
 * accounting for the decision log.
 *
 * Current Opus/Sonnet models removed sampling parameters (`temperature` is
 * rejected), so reproducibility comes from the decision log + deterministic
 * extraction and analysis, not from sampling settings.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  modelCalls: number;
}

export interface ModelTurn {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  usage: Omit<ModelUsage, "modelCalls">;
  thinkingSummary: string | null;
  text: string | null;
}

export interface ModelClientOptions {
  model: string;
  effort: Effort;
  maxOutputTokens?: number;
}

/**
 * Mark the last content block of the final user message as a cache
 * breakpoint. Assistant tails (which can carry thinking blocks that don't
 * accept cache_control) are left untouched — in the session loop the final
 * message is effectively always a user message.
 */
function withFrontierCacheMark(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return messages;

  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  const tail = blocks.at(-1);
  if (!tail || tail.type === "thinking" || tail.type === "redacted_thinking") return messages;

  blocks[blocks.length - 1] = {
    ...tail,
    cache_control: { type: "ephemeral" },
  } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

export class ModelClient {
  private readonly client: Anthropic;
  readonly totals: ModelUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    modelCalls: 0,
  };

  constructor(private readonly options: ModelClientOptions) {
    this.client = new Anthropic({ maxRetries: 5 });
  }

  get model(): string {
    return this.options.model;
  }

  async call(request: {
    system: string;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
  }): Promise<ModelTurn> {
    const message = await this.client.messages
      .stream({
        model: this.options.model,
        max_tokens: this.options.maxOutputTokens ?? 32_000,
        // Two cache breakpoints: the stable prefix (tools + system) and a
        // rolling one on the newest turn, so each request re-reads the prior
        // conversation — including image tiles — from cache instead of
        // re-processing it.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: withFrontierCacheMark(request.messages),
        tools: request.tools,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: this.options.effort },
      })
      .finalMessage();

    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    this.totals.inputTokens += usage.inputTokens;
    this.totals.outputTokens += usage.outputTokens;
    this.totals.cacheReadTokens += usage.cacheReadTokens;
    this.totals.cacheWriteTokens += usage.cacheWriteTokens;
    this.totals.modelCalls += 1;

    const thinkingSummary =
      message.content
        .filter((block): block is Anthropic.ThinkingBlock => block.type === "thinking")
        .map((block) => block.thinking)
        .filter((text) => text.trim() !== "")
        .join("\n\n") || null;
    const text =
      message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n") || null;

    return {
      content: message.content,
      stopReason: message.stop_reason,
      usage,
      thinkingSummary,
      text,
    };
  }
}
