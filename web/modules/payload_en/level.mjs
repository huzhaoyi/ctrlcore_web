export function gpioLevelText(value, connected) {
  if (!connected) {
    return "—";
  }

  const numericValue = Number(value);
  if (numericValue === 1) {
    return "HIGH";
  }
  if (numericValue === 0) {
    return "LOW";
  }
  return "—";
}
