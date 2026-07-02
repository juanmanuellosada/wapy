import { Button, Column, Heading, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface OrderApprovedOwnerItem {
  productName: string;
  quantity: number;
  variantLabel?: string | null;
  lineTotalFormatted: string;
}

interface OrderApprovedOwnerProps {
  storeName: string;
  orderRef: string;
  items: OrderApprovedOwnerItem[];
  totalFormatted: string;
  dashboardUrl: string;
}

export default function OrderApprovedOwner({
  storeName,
  orderRef,
  items,
  totalFormatted,
  dashboardUrl,
}: OrderApprovedOwnerProps) {
  return (
    <Layout previewText={`Nuevo pago recibido en ${storeName}`}>
      <Heading style={heading}>¡Nuevo pago recibido!</Heading>
      <Text style={subtitle}>
        El pedido <strong>#{orderRef.slice(0, 8)}</strong> en {storeName} fue pagado y confirmado por Mercado Pago.
      </Text>

      <Section style={table}>
        {items.map((item, i) => (
          <Row key={i} style={i % 2 === 0 ? rowOdd : rowEven}>
            <Column style={itemCell}>
              {item.quantity}x {item.productName}
              {item.variantLabel ? ` (${item.variantLabel})` : ''}
            </Column>
            <Column style={priceCell}>{item.lineTotalFormatted}</Column>
          </Row>
        ))}
        <Row style={totalRow}>
          <Column style={totalLabel}>Total</Column>
          <Column style={totalValue}>{totalFormatted}</Column>
        </Row>
      </Section>

      <Button href={dashboardUrl} style={button}>
        Ver pedido en el panel
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

const itemCell: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  padding: '10px 16px',
};

const priceCell: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 16px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  width: '100px',
};

const totalRow: React.CSSProperties = {
  backgroundColor: '#FBF7EC',
};

const totalLabel: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '10px 16px',
};

const totalValue: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  color: '#16222E',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '10px 16px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  width: '100px',
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
