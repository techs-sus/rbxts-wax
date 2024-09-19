import clipboard from "clipboardy";
import { nanoid } from "nanoid";
import fs from "fs/promises";
const keys: Set<string> = new Set();

const getScriptSource = async () => {
	return await Bun.$`lune run wax -- bundle output=out/wax.luau ci-mode=true env-name=wax verbose=false`
		.quiet()
		.then(async () => {
			const output = await Bun.file("out/wax.luau").text();
			try {
				await fs.rm("out/wax.luau");
			} catch (e) {}

			return output;
		})
		.catch((e) => "return error('error in bundling', 0)");
};

const SERVING_URL =
	process.argv[2] ||
	(await Bun.$`devtunnel show -j`.quiet().then(async (v) => {
		const id = JSON.parse(v.text()).tunnel.tunnelId;
		try {
			await Bun.$`devtunnel port create ${id} -p 3000`.quiet();
		} catch (e) {}

		const pid = Bun.spawn(["devtunnel", "host", "--allow-anonymous", id]).pid;
		console.log(`spawned tunnel with pid ${pid}`);
		// Bun.$`devtunnel host --allow-anonymous ${id}`.nothrow();
		let url = undefined;

		while (url === undefined) {
			const showed = await Bun.$`devtunnel show -j`.quiet().then((v) => v.json());
			const ports = showed.tunnel.ports;
			for (const port of ports) {
				if (port.portNumber === 3000 && port.portUri) {
					url = port.portUri as string;
					break;
				}
			}
			console.log("waiting for tunnel to start");
		}

		console.log(`got url ${url}`);

		return url;
	}));

const generateKey = async () => {
	const key = nanoid(128);
	keys.add(key);

	await clipboard.write(`h/${SERVING_URL}key?key=${key}`);
};

Bun.serve({
	fetch: async (request: Request) => {
		const url = new URL(request.url);
		if (url.pathname === "/key") {
			const key = url.searchParams.get("key");
			if (!key || !keys.has(key)) {
				return new Response("return error('invalid key', 0)", { status: 404 });
			}

			keys.delete(key);
			await generateKey();

			return new Response(await getScriptSource());
		}

		return new Response("404", {
			status: 404,
		});
	},
});

await generateKey();
