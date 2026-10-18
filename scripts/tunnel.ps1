# Starts a free Cloudflare quick tunnel to the local app, retrying if Cloudflare is slow to respond.
# The public https://*.trycloudflare.com URL is printed by cloudflared and changes on every start.
$exe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
for ($i = 1; $i -le 8; $i++) {
  Write-Output "attempt $i"
  & $exe tunnel --url http://localhost:3000 --no-autoupdate --protocol http2
  Start-Sleep -Seconds 3
}
