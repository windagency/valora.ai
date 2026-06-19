import { registerValidator } from 'executor/validators/registry';

import { complianceCriteriaValidator } from './compliance-criteria.validator';
import { gitOperationsValidator } from './git-operations.validator';
import { secopOutputValidator } from './secops-output.validator';

registerValidator('secops', secopOutputValidator);
registerValidator('compliance', complianceCriteriaValidator);
registerValidator('git-operations', gitOperationsValidator);
