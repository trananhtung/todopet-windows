// How a friend's name is shown (SECURITY L1). A name comes from a card and is only ever text, but text can still mislead:
// a right-to-left name can reorder the words around it, and a name can pass for mine, or for the sheet's own "You". So
// every name sits in a <bdi> (isolated from its surroundings), and a name that could pass for mine is shown with the
// friend's species beside it, everywhere a name is.
import { looksLikeMe } from "../core/friends";
import { getLang } from "../core/l10n";
import type { SpeciesId } from "../core/types";
import { speciesInfo } from "../pets";

/** "🦊 Fox", in the app's language. */
export function speciesTag(species: SpeciesId): string {
  const info = speciesInfo(species);
  return `${info.emoji} ${info.name[getLang()]}`;
}

/** Could this friend's name pass for mine (or for "You")? Never for my own entry, which has no species. */
export const passesForMine = (name: string, species: SpeciesId | null, myPetName: string): species is SpeciesId => species !== null && looksLikeMe(name, myPetName);

/** The name as one plain string for a label that can't hold markup: "You (🐼 Panda)" when it could pass for mine, else the name. */
export function shownName(name: string, species: SpeciesId | null, myPetName: string): string {
  return passesForMine(name, species, myPetName) ? `${name} (${speciesTag(species)})` : name;
}

/** The name in a <bdi>, with the species beside it when the name could pass for mine. */
export function FriendName({ name, species, myPetName }: { name: string; species: SpeciesId | null; myPetName: string }) {
  return (
    <>
      <bdi>{name}</bdi>
      {passesForMine(name, species, myPetName) && <span className="friend-lookalike"> ({speciesTag(species)})</span>}
    </>
  );
}
