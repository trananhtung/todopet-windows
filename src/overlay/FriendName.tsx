// How a friend's name is shown (SECURITY L1). A name comes from a card and is only ever text, but text can still mislead:
// a right-to-left name can reorder the words around it, and a name can pass for mine, or for the sheet's own "You". So
// every name sits in a <bdi> (isolated from its surroundings), and a name that could pass for mine is shown with the
// friend's species beside it, everywhere a name is. Friends who share a name also carry a short tag from their public key
// ("Mai · #a3f", see `sameNameTags`), so that two of them can be told apart in the list, the helpers, Remove and the visitor.
import { foldName, looksLikeMe, withTag } from "../core/friends";
import { getLang } from "../core/l10n";
import type { SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";

/** "🦊 Fox", in the app's language. */
export function speciesTag(species: SpeciesId): string {
  const info = speciesInfo(species);
  return `${info.emoji} ${info.name[getLang()]}`;
}

/**
 * What goes in the brackets beside a name that could pass for mine: "🦊 Fox", or just "🍡" when the name already is the species'
 * name in either language (a pet that kept its default name: "Mochi (🍡)", not "Mochi (🍡 Mochi)").
 */
export function lookalikeTag(name: string, species: SpeciesId): string {
  const info = speciesInfo(species);
  const folded = foldName(name);
  return Object.values(info.name).some((n) => foldName(n) === folded) ? info.emoji : speciesTag(species);
}

/** Could this friend's name pass for mine (or for "You")? Never for my own entry, which has no species. */
export const passesForMine = (name: string, species: SpeciesId | null, myPetName: string): species is SpeciesId => species !== null && looksLikeMe(name, myPetName);

/**
 * The name as one plain string for a label that can't hold markup: "You (🐼 Panda)" when it could pass for mine, else the
 * name; and " · #a3f" after it when another friend has the same name (`tag`).
 */
export function shownName(name: string, species: SpeciesId | null, myPetName: string, tag?: string | null): string {
  return withTag(passesForMine(name, species, myPetName) ? `${name} (${lookalikeTag(name, species)})` : name, tag);
}

/** The name in a <bdi>, with the species beside it when the name could pass for mine, and the tag when another friend has the same name. */
export function FriendName({ name, species, myPetName, tag }: { name: string; species: SpeciesId | null; myPetName: string; tag?: string | null }) {
  return (
    <>
      <bdi>{name}</bdi>
      {passesForMine(name, species, myPetName) && <span className="friend-lookalike"> ({lookalikeTag(name, species)})</span>}
      {tag && <span className="friend-tag"> · {tag}</span>}
    </>
  );
}
