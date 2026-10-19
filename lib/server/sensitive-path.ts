export function sensitivePath(path: string): boolean {
  return path.split("/").some((part) => /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.ssh|id_(?:rsa|ed25519)|(?:secrets?|credentials?)(?:[._-].*)?)$/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part));
}
