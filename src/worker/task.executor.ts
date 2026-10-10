export class TaskExecutor {
  async execute(
    type: string,
    payload: Record<string, unknown>,
  ) {
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