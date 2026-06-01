# AWS EC2 Deployment Guide — PTTI Attendance System

This guide walks through deploying the PTTI Attendance System on AWS EC2 from scratch.

**Cost:**
| | First 12 months | After 12 months |
|---|---|---|
| EC2 t3.micro | Free (Free Tier) | ~$8/mo |
| Storage (20 GB) | Free (Free Tier) | ~$2/mo |
| Data transfer | Free (low traffic) | Likely still free |

---

## Step 1 — Launch an EC2 Instance

1. Go to **AWS Console** → search for **EC2** → click **Launch Instance**
2. Fill in:
   - **Name:** `ptti-attendance`
   - **AMI (Operating System):** Select **Ubuntu 24.04 LTS** (free tier eligible)
   - **Instance type:** `t3.micro` (free tier eligible)
3. **Key pair** — click **Create new key pair**
   - Name it `ptti-key`
   - Type: RSA, Format: `.pem`
   - Click **Create** — it downloads `ptti-key.pem` to your computer
   - **Keep this file safe — it is your only way into the server**
4. **Network settings** — click Edit and make sure these are checked:
   - Allow SSH (port 22) — **My IP only** (for security)
   - Allow HTTP (port 80) — **Anywhere**
5. **Storage:** 20 GB (default is fine)
6. Click **Launch Instance**

---

## Step 2 — Connect to Your Server

Move your key file somewhere permanent, then connect via PowerShell:

```powershell
# Fix key file permissions
icacls "C:\Users\Jose Lopez\Downloads\ptti-key.pem" /inheritance:r /grant:r "%USERNAME%:R"

# SSH into the server — replace YOUR_IP with the Public IPv4 from the EC2 console
ssh -i "C:\Users\Jose Lopez\Downloads\ptti-key.pem" ubuntu@YOUR_IP
```

You will see a Linux terminal prompt — you are now inside your cloud server.

---

## Step 3 — Install Docker on the Server

Run these commands after connecting via SSH:

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Allow your user to run Docker without sudo
sudo usermod -aG docker ubuntu

# Log out so the group change takes effect
exit
```

SSH back in:

```powershell
ssh -i "C:\Users\Jose Lopez\Downloads\ptti-key.pem" ubuntu@YOUR_IP
```

---

## Step 4 — Upload Your Project

Run this from a **new local PowerShell window** (not the SSH session):

```powershell
scp -i "C:\Users\Jose Lopez\Downloads\ptti-key.pem" -r "c:\Users\Jose Lopez\CODING FOLDER\PTTI_login_system" ubuntu@YOUR_IP:~/ptti
```

This copies the entire project folder to the server at `~/ptti`.

---

## Step 5 — Create the `.env` File on the Server

Back in the SSH window (on the server):

```bash
cd ~/ptti
nano .env
```

Paste and fill in your values:

```
POSTGRES_PASSWORD=your_database_password
JWT_SECRET=your_jwt_secret_from_local_env

# Optional — only needed for teacher email verification
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

Save: `Ctrl+O` → Enter → `Ctrl+X`

---

## Step 6 — Build and Start the App

```bash
cd ~/ptti
docker compose up -d --build
```

First build takes 2–3 minutes. When it finishes all three containers (postgres, server, client) will be running in the background.

---

## Step 7 — Add Your First Teacher Account

```bash
docker compose exec server npm run add:teacher -- \
  --name "Jose Lopez" \
  --email "jlopez@ptti.edu" \
  --password "YourPassword" \
  --subject1 "PLC 1" \
  --shift morning
```

See the main [README.md](README.md) for the full list of valid subjects and shifts.

---

## Step 8 — Open the App

In any browser, go to:

```
http://YOUR_IP
```

Replace `YOUR_IP` with the **Public IPv4 address** shown in your EC2 console. The site is now live 24/7.

---

## Step 9 — Auto-restart on Server Reboot

Run these on the server so the app comes back up automatically after any reboot:

```bash
# Make Docker start on boot
sudo systemctl enable docker

# Open the cron editor
sudo crontab -e
```

Add this line at the bottom of the cron file, then save:

```
@reboot cd /home/ubuntu/ptti && docker compose up -d
```

---

## Useful Commands (run from ~/ptti on the server)

| Command | What it does |
|---|---|
| `docker compose up -d` | Start all containers in background |
| `docker compose down` | Stop all containers (data kept) |
| `docker compose down -v` | Stop and wipe the database |
| `docker compose logs -f server` | Stream live server logs |
| `docker compose ps` | Check container status |
| `docker compose pull && docker compose up -d --build` | Redeploy after a code update |

---

## Updating the App After Code Changes

When you make changes locally and want to push them to the server:

```powershell
# 1. Upload updated files from local machine
scp -i "C:\Users\Jose Lopez\Downloads\ptti-key.pem" -r "c:\Users\Jose Lopez\CODING FOLDER\PTTI_login_system" ubuntu@YOUR_IP:~/ptti

# 2. SSH in and rebuild
ssh -i "C:\Users\Jose Lopez\Downloads\ptti-key.pem" ubuntu@YOUR_IP
cd ~/ptti
docker compose up -d --build
```

---

## Optional — Custom Domain Name

Instead of sharing an IP address with teachers, you can point a domain like `attendance.ptti.edu` to your server:

1. In your domain registrar (or school IT), create an **A record** pointing to your EC2 Public IPv4
2. In EC2, allocate an **Elastic IP** and attach it to your instance — this gives you a permanent IP that does not change on reboot (EC2 public IPs change on restart by default)
3. Teachers can then access the app at `http://attendance.ptti.edu`

To set up an Elastic IP:
1. AWS Console → EC2 → **Elastic IPs** → **Allocate Elastic IP**
2. Select the new IP → **Actions → Associate Elastic IP**
3. Choose your `ptti-attendance` instance → **Associate**

---

## Security Notes

- The `.pem` key file is the only way to access your server — back it up somewhere safe
- Never share your `.env` file or commit it to git
- The SSH rule is set to **My IP only** — if your home IP changes, update the security group in EC2 → Security Groups
