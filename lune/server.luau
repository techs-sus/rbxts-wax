--!native

local net = require("@lune/net")
local base64 = require("libs/base64")
local datetime = require("@lune/datetime")
local stdio = require("@lune/stdio")
local process = require("@lune/process")
local keys = {}

local serverHandle = net.serve(3000, {
	handleRequest = function(request: net.ServeRequest)
		if request.method ~= "GET" then
			return { status = 405 }
		end

		if request.path == "/key" then
			local query = request.query
			local key = query.key or "\\\\\\INVALID_KEY\\\\\\"
			if keys[key] == true then
				return generatePayload()
			elseif keys[key] ~= true then
				return { status = 401 }
			end
		end

		return { status = 404 }
	end,
})

local function generateKey(length: number): buffer
	local resultBuffer = buffer.create(length)
	local currentUnixTimestamp = datetime.now().unixTimestampMillis
	-- ensure that if entropy is not random, we still have some sort of protection
	for i = 0, length - 1 do
		buffer.writeu8(resultBuffer, i, math.random(1, 255) % currentUnixTimestamp)
	end

	return base64.encode(resultBuffer)
end

local URL = process.args[1]
print(URL)

local function createKeyWithUrlEmbedded()
	local generatedKey = buffer.tostring(generateKey(32))
	keys[generatedKey] = true

	return `{URL}/key?key={generatedKey}`
end
createKeyWithUrlEmbedded()

while true do
	local wantsToGenerateKey = stdio.prompt("confirm", "generate key")
	if wantsToGenerateKey then
		print(`h/{createKeyWithUrlEmbedded()}`)
	end
end
