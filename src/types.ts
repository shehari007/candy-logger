export type LogLevel = 'log' | 'warn' | 'info' | 'error';

export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: Date;
  args: any[];
}
