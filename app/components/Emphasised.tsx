/**
 * Render a translated string whose emphasised word is wrapped in `{i}…{/i}`,
 * so translators decide which word leans — word order differs per language.
 *
 * Lives here rather than beside one caller because the homepage promise cards
 * and the product gallery's authenticity panel both lean on the same
 * convention, and a second copy would drift from this one.
 */
export function Emphasised({text}: {text: string}) {
  const match = text.match(/^(.*)\{i\}(.*)\{\/i\}(.*)$/s);
  if (!match) return <>{text}</>;
  return (
    <>
      {match[1]}
      <em>{match[2]}</em>
      {match[3]}
    </>
  );
}
