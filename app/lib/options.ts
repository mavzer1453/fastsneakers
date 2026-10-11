/**
 * Option-name normalisation, shared by the storefront UI and by the loader
 * that repairs legacy option URLs.
 *
 * Lives here rather than in a component because the product route imports it
 * server-side: pulling QuickAdd (and its React tree) into a loader just to
 * read a string helper is a lot of module for one function.
 */

/** Option names in the catalog are mixed-language — normalize for display. */
export function displayOptionName(name: string): string {
  const normalized = name.trim().toLowerCase();
  // Imported catalogs name the size option many ways: "Size", "Maat",
  // "Schoenmaat", the typo'd "Mate", the default "Title", "Größe",
  // "Taille"… — they all mean Size and must all get the size dropdown.
  if (
    normalized === 'title' ||
    normalized === 'mate' ||
    normalized.includes('size') ||
    normalized.includes('maat') ||
    normalized.includes('größe') ||
    normalized.includes('grösse') ||
    normalized.includes('grootte') ||
    normalized.includes('taille')
  )
    return 'Size';
  if (
    normalized === 'kleur' ||
    normalized.includes('color') ||
    normalized.includes('colour') ||
    normalized.includes('farbe')
  )
    return 'Color';
  return name;
}

export function isSizeOption(name: string): boolean {
  return displayOptionName(name) === 'Size';
}

/**
 * True when two option names mean the same axis — "Maat" and "Size", "Kleur"
 * and "Color". Used to recognise a URL written against an option name the
 * product no longer uses.
 */
export function isSameOptionAxis(a: string, b: string): boolean {
  return displayOptionName(a).toLowerCase() === displayOptionName(b).toLowerCase();
}
