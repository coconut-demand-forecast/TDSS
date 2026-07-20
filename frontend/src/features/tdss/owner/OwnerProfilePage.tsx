import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import ProfileForm from '../profile/ProfileForm';

export default function OwnerProfilePage() {
  return (
    <OwnerConsoleLayout title="โปรไฟล์ของฉัน">
      <ProfileForm />
    </OwnerConsoleLayout>
  );
}
