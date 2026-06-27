import { Button, Heading, Link, Row, Column, Section, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface NewLeadNotificationProps {
  name: string;
  email: string;
  whatsapp: string;
  planLabel: string;
  adminUrl: string;
}

export default function NewLeadNotification({
  name,
  email,
  whatsapp,
  planLabel,
  adminUrl,
}: NewLeadNotificationProps) {
  return (
    <Layout previewText={`Nuevo lead en Wapy: ${name}`}>
      <Heading style={heading}>Nuevo lead en Wapy</Heading>
      <Text style={subtitle}>Alguien se interesó por {planLabel}.</Text>

      <Section style={table}>
        <Row style={rowOdd}>
          <Column style={cellLabel}>Nombre</Column>
          <Column style={cellValue}>{name}</Column>
        </Row>
        <Row style={rowEven}>
          <Column style={cellLabel}>Email</Column>
          <Column style={cellValue}>{email}</Column>
        </Row>
        <Row style={rowOdd}>
          <Column style={cellLabel}>WhatsApp</Column>
          <Column style={cellValue}>{whatsapp}</Column>
        </Row>
        <Row style={rowEven}>
          <Column style={cellLabel}>Plan</Column>
          <Column style={cellValue}>{planLabel}</Column>
        </Row>
      </Section>

      <Button href={adminUrl} style={button}>
        Ver en /admin/leads
      </Button>
    </Layout>
  );
}

const heading: React.CSSProperties = {
  color: '#16222E',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 8px',
};

const subtitle: React.CSSProperties = {
  color: '#666666',
  fontSize: '14px',
  margin: '0 0 24px',
};

const table: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
  width: '100%',
};

const rowOdd: React.CSSProperties = {
  backgroundColor: '#f9fafb',
};

const rowEven: React.CSSProperties = {
  backgroundColor: '#ffffff',
};

const cellLabel: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: 'bold',
  padding: '10px 16px',
  textTransform: 'uppercase',
  width: '120px',
};

const cellValue: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  padding: '10px 16px',
};

const button: React.CSSProperties = {
  backgroundColor: '#F5C84B',
  borderRadius: '50px',
  color: '#16222E',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '800',
  marginTop: '24px',
  padding: '12px 24px',
  textDecoration: 'none',
};
