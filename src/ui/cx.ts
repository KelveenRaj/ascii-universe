/** Joins class names, skipping falsy ones: cx(styles.a, open && styles.open). */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
