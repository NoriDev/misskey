import { URLSearchParams } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository } from '@/models/index.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { MetaService } from '@/core/MetaService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
	},

	errors: {
		noSuchDescription: {
			message: 'No such description.',
			code: 'NO_SUCH_DESCRIPTION',
			id: 'bea9b03f-36e0-49c5-a4db-627a029f8971',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		targetLang: { type: 'string' },
	},
	required: ['userId', 'targetLang'],
} as const;

// eslint-disable-next-line import/no-default-export
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private getterService: GetterService,
		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps) => {
			const target = await this.getterService.getUserProfiles(ps.userId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchDescription);
				throw err;
			});

			if (target.description == null) {
				return 204;
			}

			const instance = await this.metaService.fetch();

			if (instance.deeplAuthKey == null) {
				return 204; // TODO: 良い感じのエラー返す
			}

			let targetLang = ps.targetLang;
			if (targetLang.includes('-')) targetLang = targetLang.split('-')[0];

			const params = new URLSearchParams();
			params.append('auth_key', instance.deeplAuthKey);
			params.append('text', target.description);
			params.append('target_lang', targetLang);

			const endpoint = instance.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';

			const res = await this.httpRequestService.send(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json, */*',
				},
				body: params.toString(),
			});

			const json = (await res.json()) as {
				translations: {
					detected_source_language: string;
					text: string;
				}[];
			};

			return {
				sourceLang: json.translations[0].detected_source_language,
				text: json.translations[0].text,
			};
		});
	}
}
