import { memo, useId } from "react";
import type { SpeciesId } from "../core/types";
import { renderPet, type PetPose } from "../pets";

interface Props {
  id: SpeciesId;
  pose: PetPose;
  size: number;
  /** Shows the 160×160 box edge so clipping is easy to spot. */
  framed?: boolean;
}

/** One pet frame. Each instance gets its own SVG id prefix so gradients don't collide. */
export const PetView = memo(function PetView({ id, pose, size, framed }: Props) {
  const prefix = "p" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div
      className={`g-pet${framed ? " g-pet--framed" : ""}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: renderPet(id, pose, { idPrefix: prefix, size }) }}
    />
  );
});
