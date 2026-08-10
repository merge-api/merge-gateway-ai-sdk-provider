import type { EmbedResultV5, InnerEmbeddingModel } from "./types.js";

/**
 * Down-level adapter: presents the V3 embedding model as an
 * `EmbeddingModelV2<string>` for AI SDK v5 consumers. The V2 and V3
 * embedding contracts are shape-identical for everything this model returns.
 */
export class MergeGatewayEmbeddingModelV5 {
  readonly specificationVersion = "v2" as const;

  constructor(private readonly inner: InnerEmbeddingModel) {}

  get provider(): string {
    return this.inner.provider;
  }

  get modelId(): string {
    return this.inner.modelId;
  }

  get maxEmbeddingsPerCall(): number | undefined {
    return this.inner.maxEmbeddingsPerCall;
  }

  get supportsParallelCalls(): boolean {
    return this.inner.supportsParallelCalls;
  }

  doEmbed(options: {
    values: Array<string>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): PromiseLike<EmbedResultV5> {
    return this.inner.doEmbed(options);
  }
}
