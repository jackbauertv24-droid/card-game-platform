export function logger(level: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logData = data ? JSON.stringify(data) : '';
  console.log(`[${timestamp}] [${level}] ${message} ${logData}`);
}

export function logRequest(method: string, path: string, status: number, duration: number) {
  logger('info', `${method} ${path}`, { status, duration: `${duration}ms` });
}
