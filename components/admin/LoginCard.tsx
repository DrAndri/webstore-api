'use client';
import { GithubOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Flex, Typography } from 'antd';

export default function LoginCard({
  error,
  signedOut,
  loginUrl,
  disabled
}: {
  error?: string;
  signedOut: boolean;
  loginUrl: string;
  disabled: boolean;
}) {
  return (
    <Flex
      justify="center"
      align="center"
      style={{ minHeight: '100vh', padding: 16 }}
    >
      <Card style={{ width: 380, maxWidth: '100%' }}>
        <Flex vertical gap={16}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Scraper admin
          </Typography.Title>
          {error && <Alert type="error" title={error} showIcon />}
          {signedOut && !error && (
            <Alert type="success" title="You have been signed out." showIcon />
          )}
          <Button
            type="primary"
            size="large"
            icon={<GithubOutlined />}
            href={loginUrl}
            disabled={disabled}
          >
            Sign in with GitHub
          </Button>
        </Flex>
      </Card>
    </Flex>
  );
}
