# Security Rules & Lockdown Specifications — BuildOS Infra

Security is paramount in the operational design of BuildOS Infra. Because it has powerful control overrides over multi-node server infrastructure, the control plane adheres strictly to the following security protocols.

---

## 1. Network Topology Hardening
- **No Inbound Docker Socket Openings**: Deploys do NOT open ports `2375` or `2376` on remote hosts. The Python agent accesses `/var/run/docker.sock` locally, meaning all internet access endpoints remain blocked.
- **Egress-Only Tunnels**: Homelab components use Cloudflare Zero-Trust tunnels (`cloudflared`). No inbound residential router ports are configured.

---

## 2. API Credentials & Operations Encryption
- **Server-Side API Boundaries**: Cloudflare API keys and host tokens are kept exclusively in backend vaults (`.env` properties). Web dashboards never query third-party APIs directly; they must proxy through master FastAPI handlers.
- **Callback Integrity Verification**: Remote daemon agents present high-entropy secret hashes (`SECURE_AGENT_TOKEN`) in the authentication headers of all socket connections.

---

## 3. Emergency Lockdown Sequence (Safeguards)
To execute emergency maneuvers safely and exclude unauthorized inputs during stressful alert conditions, we require a two-phase confirmation protocol.

### 1. Actuation Safeguards (Airlock Phase)
1. User clicks the Emergency Trigger.
2. Card transitions to Warning Phase 1: User must manually check a detailed confirmation checkbox:
   `[ ] "I verify that triggering this will terminate all running apps, shutdown VPS Docker agents, isolate local nodes, and remove public domains."`
3. Card transitions to Phase 2: User must type the high-contrast uppercase confirmation keyphrase:
   `"FORCE KILL"`
4. App executes post payloads.

### 2. Operational System Lock
Once `emergencyKillTriggered` is set to `TRUE`:
- Python agents and master APIs reject container state alteration actions instantly.
- Cloudflare DNS mapping update API routes reject requests cleanly returning error status codes.
- The control plane shuts down active Cloudflare tunnels, blocking routing paths immediately to prevent data egress.
- System requires manual operator input to clear locks and reboot operational agents safely.
