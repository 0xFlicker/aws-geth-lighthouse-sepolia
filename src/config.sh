#!/bin/bash

# Update with optional user data that will run on instance start.
# Learn more about user-data: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html
yum update -y
sudo su

yum install amazon-cloudwatch-agent -y

echo "Generating JWT secret"
mkdir -p /etc/jwt
openssl rand -hex 32 | tr -d "\n" > "/etc/jwt/jwt-secret"

echo "Install geth"

cd /usr/bin

wget -q https://gethstore.blob.core.windows.net/builds/geth-linux-arm64-1.10.23-d901d853.tar.gz -O geth.tar.gz
tar -xvf geth.tar.gz
rm geth.tar.gz
mv geth*/geth .
rm -rf geth-*
geth version

echo "Install lighthouse"
wget -q https://github.com/sigp/lighthouse/releases/download/v3.1.0/lighthouse-v3.1.0-aarch64-unknown-linux-gnu-portable.tar.gz -O lighthouse.tar.gz
tar -xvf lighthouse.tar.gz
rm lighthouse.tar.gz
lighthouse --version
