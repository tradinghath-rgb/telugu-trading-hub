# AWS Deployment Guide for Trading Hub

This document explains how to deploy your Trading Hub application on Amazon Web Services (AWS) using either **AWS App Runner** (Easiest & Recommended) or **AWS Elastic Beanstalk / EC2**.

---

## Architecture Overview on AWS
- **Application Server**: AWS App Runner or AWS Elastic Beanstalk (Runs `server.js`).
- **Media & Charts Storage**: AWS S3 Bucket with CloudFront CDN for global, ultra-fast video delivery.
- **Domain & SSL**: AWS Route 53 + AWS Certificate Manager (Free SSL/HTTPS).
- **Payment Processing**: Razorpay Gateway (`https://rzp.io/rzp/2a3h6cU`).

---

## Option 1: Deploy on AWS App Runner (Fastest & Zero-DevOps)

AWS App Runner automatically builds, scales, and runs your containerized or Node.js application.

### Step 1: Create an AWS S3 Bucket (For videos and media)
1. Log into your **AWS Console** and search for **S3**.
2. Click **Create Bucket**.
3. Name: `tradinghub-media-bucket` (or any unique name).
4. Region: Choose `ap-south-1` (Mumbai) or your closest region.
5. In Object Ownership, enable ACLs or keep default Bucket Owner Enforced.
6. Click **Create Bucket**.

### Step 2: Get AWS IAM Credentials
1. Go to **AWS IAM** -> **Users** -> **Create User**.
2. User Name: `tradinghub-backend-user`.
3. Attach Policy: `AmazonS3FullAccess`.
4. Generate an **Access Key ID** and **Secret Access Key** and save them safely.

### Step 3: Deploy with AWS App Runner
1. In the AWS Console, search for **App Runner**.
2. Click **Create an App Runner service**.
3. Source: Select **Source code repository** (Connect your GitHub repo containing this code).
4. Build settings:
   - Runtime: `Node.js 20`
   - Build command: `npm install`
   - Start command: `node server.js`
   - Port: `3000`
5. Under **Environment variables**, add:
   - `AWS_REGION`: `ap-south-1`
   - `AWS_S3_BUCKET`: `tradinghub-media-bucket`
   - `AWS_ACCESS_KEY_ID`: `your-access-key-id`
   - `AWS_SECRET_ACCESS_KEY`: `your-secret-access-key`
   - `RAZORPAY_URL`: `https://rzp.io/rzp/2a3h6cU`
6. Click **Deploy**. In ~3-5 minutes, AWS will generate a live HTTPS URL (e.g. `https://xyz123.ap-south-1.awsapprunner.com`)!

---

## Option 2: Deploy on AWS Elastic Beanstalk

1. Install the AWS Elastic Beanstalk CLI:
   ```bash
   pip install awsebcli
   ```
2. Initialize EB in this directory:
   ```bash
   eb init -p node.js trading-hub --region ap-south-1
   ```
3. Create an environment and deploy:
   ```bash
   eb create trading-hub-env
   ```
4. Set environment variables:
   ```bash
   eb setenv AWS_REGION=ap-south-1 AWS_S3_BUCKET=tradinghub-media-bucket RAZORPAY_URL=https://rzp.io/rzp/2a3h6cU
   ```
5. Open your live app:
   ```bash
   eb open
   ```

---

## Option 3: Deploy on AWS EC2 Ubuntu Instance

1. Launch an EC2 `t3.micro` or `t3.small` instance with Ubuntu 24.04 LTS.
2. SSH into the instance:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```
3. Install Node.js 20 and PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```
4. Clone or transfer your `FINALWEB` files to `/var/www/tradinghub`.
5. Install dependencies and start with PM2:
   ```bash
   cd /var/www/tradinghub
   npm install
   pm2 start server.js --name "trading-hub"
   pm2 startup
   pm2 save
   ```
6. Set up Nginx reverse proxy to forward port 80/443 to port 3000 with Certbot for free SSL:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

## Live Website CMS & Zero Re-Deployment
Remember: **You do NOT need to redeploy the site or touch the code whenever you want to change website text, headlines, pricing, or upload new charts!**
Simply log in to your **Admin Page**, make your edits or upload charts with the **Plus (+)** button, and click save. The backend saves your updates in real-time!
