import { getTranslation } from '../../../../../../i18n/server';
import {
  HttpError,
  parseId,
  readJson,
  withAdmin
} from '../../../../../../utils/admin/api';
import { saveConfigFile } from '../../../../../../utils/admin/github';
import { checkConfigText } from '../../../../../../utils/admin/storeConfig';

const MAX_CONFIG_LENGTH = 200 * 1000;

// Commits the config file as the signed in admin
export const PUT = withAdmin<{ params: Promise<{ id: string }> }>(
  async (request, { params, user }) => {
    const id = parseId((await params).id);
    const body = await readJson<{
      text?: string;
      sha?: string | null;
      message?: string;
    }>(request);
    if (typeof body.text !== 'string' || body.text.length > MAX_CONFIG_LENGTH)
      throw new HttpError(400, { key: 'stores.textRequired' });
    const message = body.message?.trim() ?? '';
    if (message.length < 3)
      throw new HttpError(400, { key: 'stores.commitMessage' });
    // The problems are in the language of the request
    const { t } = await getTranslation('stores');
    const { errors } = checkConfigText(body.text, t, id);
    if (errors.length > 0)
      throw new HttpError(400, {
        key: 'invalidConfig',
        values: { errors: errors.join(', ') }
      });
    return saveConfigFile(
      id,
      body.text.endsWith('\n') ? body.text : body.text + '\n',
      body.sha ?? null,
      message.slice(0, 500),
      user
    );
  }
);
