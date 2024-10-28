class CloudflareAPI {
	constructor(token) {
		this.token = token;
	}

	async purgeCacheForUrls(zoneId, urls) {
		const cloudflareUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
		const response = await fetch(cloudflareUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ files: urls })
		});
		const result = await response.json();

		if (response.ok) {
			console.log(`Cache purged successfully for ${urls.join(', ')}`);
		} else {
			console.error("Failed to purge cache:", result);
		}
	}

	async getZoneId(domain) {
		const url = `https://api.cloudflare.com/client/v4/zones?name=${domain}`;
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			}
		});
		const data = await response.json();

		if (data.success && data.result.length > 0) {
			return data.result[0].id;
		} else {
			throw new Error(`Zone ID not found for domain ${domain}`);
		}
	}
}

class TildaAPI {
	constructor(publicKey, secretKey) {
		this.publicKey = publicKey;
		this.secretKey = secretKey;
	}
	async getProjectDomain(projectId) {
		const projectInfoUrl = `https://api.tildacdn.info/v1/getprojectinfo/?publickey=${this.publicKey}&secretkey=${this.secretKey}&projectid=${projectId}`;
		const projectResponse = await fetch(projectInfoUrl);
		const projectData = await projectResponse.json();

		if (projectData.status === "FOUND" && projectData.result && projectData.result.customdomain) {
			return projectData.result.customdomain;
		} else {
			throw new Error('Failed to retrieve project domain');
		}
	}

	async getPageFilenames(pageId) {
		const pageInfoUrl = `https://api.tildacdn.info/v1/getpage/?publickey=${this.publicKey}&secretkey=${this.secretKey}&pageid=${pageId}`;
		const pageResponse = await fetch(pageInfoUrl);
		const pageData = await pageResponse.json();

		if (pageData.status === "FOUND" && pageData.result && pageData.result.filename) {
			return [ pageData.result.filename, pageData.result.alias ]
		} else {
			throw new Error('Failed to retrieve page filename');
		}
	}
}

export default {
	async fetch(request, env, ctx) {
		const requestUrl = new URL(request.url);
		const requestParams = requestUrl.searchParams;

		const pageId = requestParams.get('pageid');
		const projectId = requestParams.get('projectid');
		const publicKey = requestParams.get('publickey');
		if (!pageId || !projectId || !publicKey) {
			return new Response('Missing parameters', { status: 400 });
		}

		if (publicKey !== env.TILDA_PUBLIC_KEY) {
			return new Response('Wrong public key', { status: 403 })
		}

		const cf = new CloudflareAPI(env.CLOUDFLARE_API_TOKEN);
		const tilda = new TildaAPI(env.TILDA_PUBLIC_KEY, env.TILDA_SECRET_KEY);

		try {
			const customDomain = await tilda.getProjectDomain(projectId);
			const zoneId = await cf.getZoneId(customDomain);
			const pageFilenames = await tilda.getPageFilenames(pageId);
			const urls = pageFilenames.map(pageFilename => `https://${customDomain}/${pageFilename}`);
			await cf.purgeCacheForUrls(zoneId, urls);

			return new Response(`Cache purged for ${urls.join(', ')}`, { status: 200 });
		} catch (error) {
			console.error(error);

			return new Response(`Error: ${error.message}`, { status: 500 });
		}
	},
};
