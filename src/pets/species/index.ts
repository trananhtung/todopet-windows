import type { SpeciesId } from "../../core/types";
import type { SpeciesDef } from "../kit";
import { axolotl } from "./axolotl";
import { bunny } from "./bunny";
import { capybara } from "./capybara";
import { cat } from "./cat";
import { dragon } from "./dragon";
import { duckling } from "./duckling";
import { fox } from "./fox";
import { frog } from "./frog";
import { hamster } from "./hamster";
import { mochi } from "./mochi";
import { panda } from "./panda";
import { penguin } from "./penguin";
import { shiba } from "./shiba";
import { unicorn } from "./unicorn";

export const DEFS: Readonly<Record<SpeciesId, SpeciesDef>> = {
  mochi,
  cat,
  shiba,
  bunny,
  fox,
  panda,
  penguin,
  frog,
  hamster,
  axolotl,
  capybara,
  duckling,
  dragon,
  unicorn,
};
