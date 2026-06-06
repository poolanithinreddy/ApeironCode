export interface SecretEgressResult {
  detected: boolean;
  riskLevel: 'none' | 'medium' | 'high' | 'critical';
  patterns: string[];
  recommendations: string[];
}

const NETWORK_RE = /(\bcurl\b|\bwget\b|\bnc\b|\bncat\b|\bnetcat\b|\bscp\b|\bsftp\b|\bftp\b|\bssh\b)/u;
const CREDENTIAL_FILE_RE = /(\.env(\.[^\s|]+)?|~?\/?\.ssh\/[^\s|]*|id_rsa|id_ed25519|~?\/?\.aws\/credentials|~?\/?\.config\/gcloud|~?\/?\.npmrc|~?\/?\.netrc|~?\/?\.pypirc)/u;

const elevate = (current: SecretEgressResult['riskLevel'], next: SecretEgressResult['riskLevel']): SecretEgressResult['riskLevel'] => {
  const order: SecretEgressResult['riskLevel'][] = ['none', 'medium', 'high', 'critical'];
  return order[Math.max(order.indexOf(current), order.indexOf(next))] as SecretEgressResult['riskLevel'];
};

export const detectSecretEgress = (rawCommand: string): SecretEgressResult => {
  const patterns: string[] = [];
  let level: SecretEgressResult['riskLevel'] = 'none';
  const cmd = rawCommand;

  // cat .env / printenv / env piped to network tool -> critical
  if (/\bcat\s+[^|]*\.env(\.[^\s|]+)?\b[^|]*\|\s*(curl|wget|nc|ncat|netcat)/iu.test(cmd)) {
    patterns.push('cat .env piped to network tool');
    level = elevate(level, 'critical');
  }
  if (/\b(printenv|env)\b[^|]*\|\s*(curl|wget|nc|ncat|netcat)/iu.test(cmd)) {
    patterns.push('environment dumped to network tool');
    level = elevate(level, 'critical');
  }
  if (/\bcurl\b[^&;]*(--data|--data-binary|-d)\s+@\.env/iu.test(cmd)) {
    patterns.push('curl uploading .env file');
    level = elevate(level, 'critical');
  }
  if (/\bcurl\b[^&;]*(--upload-file|-T)\s+[^\s&;]*\.env/iu.test(cmd)) {
    patterns.push('curl upload of .env');
    level = elevate(level, 'critical');
  }
  if (/\bscp\b[^&;]*(\.ssh\/|id_rsa|id_ed25519|\.pem|\.key)/iu.test(cmd)) {
    patterns.push('scp transferring SSH/private key material');
    level = elevate(level, 'critical');
  }
  if (/\bcat\s+[^|]*\.ssh\/[^\s|]*\b[^|]*\|\s*(curl|wget|nc|ncat|netcat)/iu.test(cmd)) {
    patterns.push('SSH key content piped to network tool');
    level = elevate(level, 'critical');
  }

  // Echo $TOKEN / $SECRET / $API_KEY piped to network -> high
  if (/\becho\s+[^|]*\$(?:TOKEN|SECRET|API_KEY|PASSWORD|PASS|AUTH)\b[^|]*\|\s*(curl|wget|nc)/iu.test(cmd)) {
    patterns.push('echo of secret env var piped to network');
    level = elevate(level, 'high');
  }

  // Generic | curl/wget/nc with credential reference on left side
  if (/\|\s*(curl|wget|nc|ncat|netcat)/iu.test(cmd)) {
    const left = cmd.split(/\|/u)[0] ?? '';
    if (CREDENTIAL_FILE_RE.test(left)) {
      patterns.push('credential file content piped to network tool');
      level = elevate(level, 'high');
    }
  }

  // $() substitution containing credential file path sent to network
  const subRe = /\$\(([^)]*)\)/gu;
  let m: RegExpExecArray | null;
  while ((m = subRe.exec(cmd)) !== null) {
    const inner = m[1] ?? '';
    if (CREDENTIAL_FILE_RE.test(inner) && NETWORK_RE.test(cmd)) {
      patterns.push('command substitution reads credentials within network call');
      level = elevate(level, 'high');
    }
  }

  // Long token-like string passed via -H or -d (do NOT include the token in the output)
  if (/\bcurl\b[^&;]*(?:-H|-d|--data|--data-raw)\s+["']?[^"'\s]*[A-Za-z0-9_-]{24,}/u.test(cmd)) {
    patterns.push('curl with embedded long token-like value');
    level = elevate(level, 'high');
  }

  const recommendations: string[] = [];
  if (level !== 'none') {
    recommendations.push('Avoid sending credentials, .env, or SSH keys to remote hosts.');
    recommendations.push('Use a secrets manager and short-lived tokens instead of inline secrets.');
  }

  return {
    detected: level !== 'none',
    riskLevel: level,
    patterns,
    recommendations,
  };
};

export const formatSecretEgressWarning = (result: SecretEgressResult): string => {
  if (!result.detected) return 'No secret egress patterns detected.';
  const lines: string[] = [`Secret egress risk: ${result.riskLevel}`];
  for (const p of result.patterns) lines.push(`- pattern: ${p}`);
  for (const r of result.recommendations) lines.push(`- recommend: ${r}`);
  // Defensive: redact anything that looks like a long token in our own descriptions
  return lines.join('\n').replace(/[A-Za-z0-9_-]{24,}/gu, '[redacted]');
};
