
export class TaskExecutor {
  async execute(
    type: string,
    payload: Record<string, unknown>,
  ) {
    // Development/testing hook to simulate task failures.
    if (payload.simulateFailure === true) {
      throw new Error('Simulated task failure for retry testing');
    }

    // Development/testing hook to simulate a long-running task.
    // Useful for testing worker crashes and job recovery.
    if (typeof payload.simulateDelayMs === 'number') {
      const delayMs = Math.min(
        Math.max(payload.simulateDelayMs, 0),
        120_000,
      );

      console.log(
        `[TaskExecutor] Simulating a delay of ${delayMs}ms for ${type}.`,
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }

    switch (type) {
      case 'CPU_TASK':
        return this.executeCpuTask(payload);

      case 'IO_TASK':
        return this.executeIoTask(payload);

      case 'DOCUMENT_PROCESSING':
        return this.executeDocumentTask(payload);

      case 'WEBHOOK':
        return this.executeWebhookTask(payload);

      default:
        throw new Error(`Unsupported job type: ${type}`);
    }
  }

  private async executeCpuTask(
    payload: Record<string, unknown>,
  ) {
    return {
      success: true,
      type: 'CPU_TASK',
      received: payload,
    };
  }

  private async executeIoTask(
    payload: Record<string, unknown>,
  ) {
    return {
      success: true,
      type: 'IO_TASK',
      received: payload,
    };
  }

  private async executeDocumentTask(
    payload: Record<string, unknown>,
  ) {
    return {
      success: true,
      type: 'DOCUMENT_PROCESSING',
      received: payload,
    };
  }

  private async executeWebhookTask(
    payload: Record<string, unknown>,
  ) {
    return {
      success: true,
      type: 'WEBHOOK',
      received: payload,
    };
  }
}
