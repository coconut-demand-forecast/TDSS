import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { useLanguage } from '../../../context/LanguageContext';
import ProfileForm from '../profile/ProfileForm';

export default function OwnerProfilePage() {
  const { t } = useLanguage();
  return (
    <OwnerConsoleLayout title={t('pageTitle.myProfile')}>
      <ProfileForm />
    </OwnerConsoleLayout>
  );
}
