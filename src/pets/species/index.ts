import type { SpeciesId } from "../../core/types";
import type { SpeciesDef } from "../kit";
import { axolotl } from "./axolotl";
import { banhbao } from "./banhbao";
import { bee } from "./bee";
import { bunny } from "./bunny";
import { capybara } from "./capybara";
import { cat } from "./cat";
import { dragon } from "./dragon";
import { duckling } from "./duckling";
import { fox } from "./fox";
import { frog } from "./frog";
import { hamster } from "./hamster";
import { hedgehog } from "./hedgehog";
import { hippo } from "./hippo";
import { koala } from "./koala";
import { lamb } from "./lamb";
import { mochi } from "./mochi";
import { otter } from "./otter";
import { owl } from "./owl";
import { panda } from "./panda";
import { penguin } from "./penguin";
import { piglet } from "./piglet";
import { redpanda } from "./redpanda";
import { seal } from "./seal";
import { shiba } from "./shiba";
import { unicorn } from "./unicorn";
import { yaoyiyao } from "./yaoyiyao";

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
  redpanda,
  otter,
  hedgehog,
  koala,
  hippo,
  seal,
  owl,
  lamb,
  piglet,
  banhbao,
  yaoyiyao,
  bee,
  dragon,
  unicorn,
};
