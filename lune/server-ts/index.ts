import clipboard from "clipboardy";
import { nanoid } from "nanoid";
import fs from "fs/promises";
import { stdin, stdout } from "bun";
import { confirm } from "@inquirer/prompts";
const keys: Set<string> = new Set();
const TARGET_PORT = 3000;

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
	(await Bun.$`devtunnel show -j`.quiet().then(async (initialHit) => {
		const id = initialHit.json().tunnel.tunnelId;

		// ensure TARGET_PORT is created
		await Bun.$`devtunnel port create ${id} -p ${TARGET_PORT}`.quiet().nothrow();

		// spawn the host which forwards requests
		const pid = Bun.spawn(["devtunnel", "host", "--allow-anonymous", id]).pid;
		console.log(`spawned tunnel with pid: ${pid}`);

		// look for url in json output
		let url = undefined;
		while (url === undefined) {
			const tunnel = await Bun.$`devtunnel show -j`.quiet().then((v) => v.json().tunnel);
			const ports = tunnel.ports;
			for (const port of ports) {
				if (port.portNumber === TARGET_PORT && port.portUri) {
					url = port.portUri as string;
					break;
				}
			}
			console.log("waiting for tunnel to start...");
		}

		console.log(`got url: ${url}`);

		return url;
	}));

const generateKey = async (writeToClipboard: boolean = false) => {
	const key = nanoid(128);
	keys.add(key);

	const clipboardContents = `h/${SERVING_URL}?key=${key}`;
	if (writeToClipboard) await clipboard.write(clipboardContents);
};

Bun.serve({
	fetch: async (request: Request) => {
		const url = new URL(request.url);
		if (url.pathname === "/") {
			const key = url.searchParams.get("key");
			if (!key || !keys.has(key)) {
				return new Response("return error('invalid key', 0)", { status: 404 });
			}

			keys.delete(key);
			await generateKey(false);

			return new Response(await getScriptSource());
		}

		return new Response("404", {
			status: 404,
		});
	},

	port: TARGET_PORT,
});

while (true) {
	if (
		await confirm({
			message: "Generate a new key?",
		})
	) {
		await generateKey(true);
	}
}
