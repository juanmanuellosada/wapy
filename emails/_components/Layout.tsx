import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface LayoutProps {
  previewText: string;
  children: React.ReactNode;
}

export function Layout({ previewText, children }: LayoutProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={brand}>wapy</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Hr style={divider} />
            <Text style={footerText}>
              © {new Date().getFullYear()} Wapy · hola@wapy.com.ar
            </Text>
            <Text style={footerText}>
              Si no esperabas este email, podés ignorarlo.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#f4f4f4',
  fontFamily: 'sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  margin: '40px auto',
  maxWidth: '600px',
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  backgroundColor: '#16222E',
  padding: '32px 40px',
  textAlign: 'center',
};

const brand: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: 0,
};

const content: React.CSSProperties = {
  padding: '40px',
};

const footer: React.CSSProperties = {
  padding: '0 40px 32px',
};

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #eeeeee',
  margin: '0 0 24px',
};

const footerText: React.CSSProperties = {
  color: '#cccccc',
  fontSize: '12px',
  margin: '0 0 4px',
  textAlign: 'center',
};
