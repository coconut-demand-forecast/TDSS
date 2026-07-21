import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { useLanguage } from '../../../context/LanguageContext';
import ProfileForm from './ProfileForm';

export default function ProfilePage() {
  const { t } = useLanguage();
  return (
    <OrgWorkspaceLayout title={t('pageTitle.myProfile')}>
      <ProfileForm />
    </OrgWorkspaceLayout>
  );
}
