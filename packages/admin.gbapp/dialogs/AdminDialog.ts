/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' _ `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__, \| (˅) |( (_) )  |
|   | ,__/'(_)  `\__,_)`\__  |(_) (_) (_)`\__,_)`\__)(_)(____/(_) (_)`\___/'  |
|   | |                ( )_) |                                                |
|   (_)                 \___/'                                                |
|                                                                             |
| General Bots Copyright (c) Pragmatismo.io. All rights reserved.             |
| Licensed under the AGPL-3.0.                                                |
|                                                                             |
| According to our dual licensing model, this program can be used either      |
| under the terms of the GNU Affero General Public License, version 3,        |
| or under a proprietary license.                                             |
|                                                                             |
| The texts of the GNU Affero General Public License with an additional       |
| permission and of our proprietary license can be found at and               |
| in the LICENSE file you have received along with this program.              |
|                                                                             |
| This program is distributed in the hope that it will be useful,             |
| but WITHOUT ANY WARRANTY without even the implied warranty of               |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

/**
 * @fileoverview General Bots server core.
 */

'use strict';

const crypto = require('crypto');
import { WaterfallDialog } from 'botbuilder-dialogs';
import { GBMinInstance, IGBDialog, GBLog } from 'botlib';
import urlJoin = require('url-join');
import { GBConfigService } from '../../core.gbapp/services/GBConfigService';
import { GBDeployer } from '../../core.gbapp/services/GBDeployer';
import { GBImporter } from '../../core.gbapp/services/GBImporterService';
import { Messages } from '../strings';
import { GBAdminService } from '../services/GBAdminService';

/**
 * Dialogs for administration tasks.
 */
export class AdminDialog extends IGBDialog {

  /**
   * Setup dialogs flows and define services call.
   *
   * @param bot The bot adapter.
   * @param min The minimal bot instance data.
   */
  public static setup(min: GBMinInstance) {
    // Setup services.

    const importer = new GBImporter(min.core);
    const deployer = new GBDeployer(min.core, importer);
    const adminService = new GBAdminService(min.core);

    AdminDialog.setupSecurityDialogs(min);

    min.dialogs.add(
      new WaterfallDialog('/admin', [
        async step => {
          const locale = step.context.activity.locale;
          const prompt = Messages[locale].authenticate;

          return await step.prompt('textPrompt', prompt);
        },
        async step => {
          const locale = step.context.activity.locale;
          const sensitive = step.result;

          if (sensitive === min.instance.adminPass) {
            await step.context.sendActivity(Messages[locale].welcome);

            return await step.prompt('textPrompt', Messages[locale].which_task);
          } else {
            await step.context.sendActivity(Messages[locale].wrong_password);

            return await step.endDialog();
          }
        },
        async step => {
          const locale: string = step.context.activity.locale;
          // tslint:disable-next-line:no-unsafe-any
          const text: string = step.result;
          const cmdName = text.split(' ')[0];

          await step.context.sendActivity(Messages[locale].working(cmdName));
          let unknownCommand = false;

          try {


            if (text === 'quit') {
              return await step.replaceDialog('/');
            } else if (cmdName === 'deployPackage' || cmdName === 'dp') {
              await GBAdminService.deployPackageCommand(min, text, deployer);

              return await step.replaceDialog('/admin', { firstRun: false });
            } else if (cmdName === 'redeployPackage' || cmdName === 'rp') {
              await step.context.sendActivity('The package is being *unloaded*...');
              await GBAdminService.undeployPackageCommand(text, min);
              await step.context.sendActivity('Now, *deploying* package...');
              await GBAdminService.deployPackageCommand(min, text, deployer);
              await step.context.sendActivity('Package deployed. Just need to rebuild the index... Doing it right now.');
              await GBAdminService.rebuildIndexPackageCommand(min, deployer);
              await step.context.sendActivity('Finished importing of that .gbkb package. Thanks.');
              return await step.replaceDialog('/admin', { firstRun: false });
            } else if (cmdName === 'undeployPackage' || cmdName === 'up') {
              await step.context.sendActivity('The package is being *undeployed*...');
              await GBAdminService.undeployPackageCommand(text, min);
              await step.context.sendActivity('Package *undeployed*.');
              return await step.replaceDialog('/admin', { firstRun: false });
            } else if (cmdName === 'rebuildIndex' || cmdName === 'ri') {
              await GBAdminService.rebuildIndexPackageCommand(min, deployer);

              return await step.replaceDialog('/admin', { firstRun: false });
            } else if (cmdName === 'syncBotServer') {
              await GBAdminService.syncBotServerCommand(min, deployer);

              return await step.replaceDialog('/admin', { firstRun: false });
            } else if (cmdName === 'setupSecurity') {
              return await step.beginDialog('/setupSecurity');
            } else {
              unknownCommand = true;
            }

            if (unknownCommand) {
              await step.context.sendActivity(Messages[locale].unknown_command);
            } else {
              await step.context.sendActivity(Messages[locale].finished_working);
            }

          } catch (error) {
            await step.context.sendActivity(error.message);
          }
          await step.replaceDialog('/ask', { isReturning: true });
        }

      ])
    );

    min.dialogs.add(
      new WaterfallDialog('/publish', [
        async step => {
          const locale = step.context.activity.locale;
          await step.context.sendActivity(Messages[locale].working('Publishing from WhatsApp'));
          let unknownCommand = false;

          try {

            const cmd1 = `deployPackage ${process.env.STORAGE_SITE} /${process.env.STORAGE_LIBRARY}/${min.instance.botId}.gbai/${min.instance.botId}.gbkb`;

            await step.context.sendActivity('Publishing your .gbkb and .gbdialog packages...');
            if (await (deployer as any).getStoragePackageByName(min.instance.instanceId, `${min.instance.botId}.gbkb`) !== null) { // TODO: Move to interface.
              const cmd2 = `undeployPackage ${min.instance.botId}.gbkb`;
              await GBAdminService.undeployPackageCommand(cmd2, min);
            }
            await GBAdminService.deployPackageCommand(min, cmd1, deployer);
            await step.context.sendActivity('Package deployed. Just need to rebuild the index... Doing it right now.');
            await GBAdminService.rebuildIndexPackageCommand(min, deployer);
            await step.context.sendActivity('Finished importing of all your packages. Thanks.');
            return await step.replaceDialog('/ask', { firstRun: false });

          } catch (error) {
            await step.context.sendActivity(error.message);
          }
          await step.replaceDialog('/ask', { isReturning: true });

        }]));
  }


  private static setupSecurityDialogs(min: GBMinInstance) {
    min.dialogs.add(
      new WaterfallDialog('/setupSecurity', [
        async step => {
          const locale = step.context.activity.locale;
          const prompt = Messages[locale].enter_authenticator_tenant;

          return await step.prompt('textPrompt', prompt);
        },
        async step => {
          step.activeDialog.state.authenticatorTenant = step.result;
          const locale = step.context.activity.locale;
          const prompt = Messages[locale].enter_authenticator_authority_host_url;

          return await step.prompt('textPrompt', prompt);
        },
        async step => {
          step.activeDialog.state.authenticatorAuthorityHostUrl = step.result;
          const locale = step.context.activity.locale;
          const prompt = Messages[locale].enter_authenticator_client_id;

          return await step.prompt('textPrompt', prompt);
        },
        async step => {
          step.activeDialog.state.authenticatorClientId = step.result;
          const locale = step.context.activity.locale;
          const prompt = Messages[locale].enter_authenticator_client_secret;

          return await step.prompt('textPrompt', prompt);
        },
        async step => {
          step.activeDialog.state.authenticatorClientSecret = step.result;

          await min.adminService.updateSecurityInfo(
            min.instance.instanceId,
            step.activeDialog.state.authenticatorTenant,
            step.activeDialog.state.authenticatorAuthorityHostUrl,
            step.activeDialog.state.authenticatorClientId,
            step.activeDialog.state.authenticatorClientSecret
          );

          const locale = step.context.activity.locale;
          const buf = Buffer.alloc(16);
          const state = `${min.instance.instanceId}${crypto.randomFillSync(buf).toString('hex')}`;

          min.adminService.setValue(min.instance.instanceId, 'AntiCSRFAttackState', state);

          const url = `https://login.microsoftonline.com/${
            min.instance.authenticatorTenant
            }/oauth2/authorize?client_id=${min.instance.authenticatorClientId}&response_type=code&redirect_uri=${urlJoin(
              min.instance.botEndpoint,
              min.instance.botId,
              '/token'
            )}&state=${state}&response_mode=query`;

          await step.context.sendActivity(Messages[locale].consent(url));

          return await step.replaceDialog('/ask', { isReturning: true });
        }
      ])
    );
  }
}
