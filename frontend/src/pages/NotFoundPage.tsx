import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Página no encontrada"
      description="La dirección no existe o no tienes acceso."
      action={
        <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
          Volver al inicio
        </Link>
      }
    />
  );
}
