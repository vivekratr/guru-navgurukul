export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}
