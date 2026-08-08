// The results & standings category, in browse order: the three rosters, the initiative order,
// the four standings / result tables, the four timing towers, then the two brackets.
//
// The towers sit next to the standings boards because that is where someone looking for one
// would look: they are the same question asked of a session that is still running.

import type { TemplateVariant } from '../../../model/wizard';
import { rs01 } from './rs01';
import { rs02 } from './rs02';
import { rs03 } from './rs03';
import { rs04 } from './rs04';
import { rs05 } from './rs05';
import { st01 } from './st01';
import { st02 } from './st02';
import { st03 } from './st03';
import { st04 } from './st04';
import { tt01 } from './tt01';
import { tt02 } from './tt02';
import { tt03 } from './tt03';
import { tt04 } from './tt04';
import { br01 } from './br01';
import { br02 } from './br02';
import { br03 } from './br03';
import { br04 } from './br04';

export const RESULTS_BOARDS: TemplateVariant[] = [
  rs01, rs02, rs03, rs05, rs04,
  st01, st02, st03, st04,
  tt01, tt02, tt03, tt04,
  br01, br02, br03, br04,
];
