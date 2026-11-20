export function printJson(data: unknown, pretty: boolean): void {
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  process.stdout.write(`${text}\n`);
}

export function printError(message: string, pretty: boolean): void {
  printJson({ error: message }, pretty);
}

export function fail(message: string, pretty: boolean): never {
  printError(message, pretty);
  process.exit(1);
}
