import { Button, Column, Heading, Link, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import { Layout } from './_components/Layout';

interface PendingOrdersDigestItem {
  orderRef: string;
  customerName: string | null;
  totalFormatted: string;
  url: string;
}

interface PendingOrdersDigestProps {
  storeName: string;
  orders: PendingOrdersDigestItem[];
  dashboardUrl: string;
}

export default function PendingOrdersDigest({ storeName, orders, dashboardUrl }: PendingOrdersDigestProps) {
  const count = orders.length;
  return (
    <Layout previewText={`Tenés ${count} pedido${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'} en ${storeName}`}>
      <Heading style={heading}>
        {count} pedido{count === 1 ? '' : 's'} pendiente{count === 1 ? '' : 's'}
      </Heading>
      <Text style={subtitle}>
        Estos pedidos de {storeName} todavía no fueron confirmados. Tocá cada uno para revisarlo y confirmarlo.
      </Text>

      <Section style={table}>
        {orders.map((order, i) => (
          <Row key={order.orderRef} style={i % 2 === 0 ? rowOdd : rowEven}>
            <Column style={itemCell}>
              <Link href={order.url} style={orderLink}>
                #{order.orderRef}
              </Link>
              {order.customerName ? ` — ${order.customerName}` : ''}
            </Column>
            <Column style={priceCell}>{order.totalFormatted}</Column>
          </Row>
        ))}
      </Section>

      <Button href={dashboardUrl} style={button}>
        Ver todos los pedidos
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

const orderLink: React.CSSProperties = {
  color: '#16222E',
  fontWeight: 'bold',
  textDecoration: 'underline',
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
