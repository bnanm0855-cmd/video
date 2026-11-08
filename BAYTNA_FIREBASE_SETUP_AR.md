# إعداد Firebase لموقع بيتنا

هذا المجلد يجهّز أساس الباك إند لموقع Baytna. لا تضع كلمات مرور أو مفاتيح Admin SDK في ملفات الموقع.

## الخدمات المطلوبة
1. Authentication: تسجيل الحسابات بالبريد الإلكتروني وكلمة المرور.
2. Cloud Firestore: بيانات العائلات، الأعضاء، الاحتياجات، الدعوات، وطلبات الانضمام.
3. استضافة الموقع يمكن أن تبقى على GitHub Pages؛ Firebase هو قاعدة البيانات وتسجيل الدخول فقط.

## إعداد Firebase Console
1. افتح المشروع `baytna-6b81d`.
2. من Project settings > General > Your apps أضف تطبيق Web إذا لم يكن موجوداً.
3. انسخ Firebase config الخاص بتطبيق الويب (apiKey, authDomain, projectId, appId وغيرها). هذا إعداد عميل عام وليس مفتاح Admin SDK.
4. من Build > Firestore Database أنشئ قاعدة البيانات. لا تفعّل قواعد مفتوحة مثل `allow read, write: if true`.
5. من Authentication > Sign-in method فعّل Email/Password (تم ذلك سابقاً).

## نموذج البيانات المقترح
```
families/{familyId}
  name, ownerId, createdAt
families/{familyId}/members/{uid}
  uid, displayName, role, status, joinedAt
families/{familyId}/items/{itemId}
  name, quantity, bought, createdBy, createdAt, updatedAt
families/{familyId}/activity/{activityId}
  actorId, action, itemName, createdAt
families/{familyId}/joinRequests/{uid}
  uid, displayName, status: pending|approved|rejected, createdAt
families/{familyId}/invites/{inviteId}
  enabled, createdBy, createdAt
```

## قواعد الحماية
الملف `firestore.rules` هو نقطة بداية مقيدة:
- لا يقرأ بيانات العائلة إلا عضو حالته active.
- صاحب العائلة وحده يدير العضويات وطلبات الانضمام.
- المستخدم يستطيع إنشاء طلب انضمام باسمه فقط.
- الأعضاء النشطون فقط يتعاملون مع قائمة الاحتياجات.
- لا يستطيع العميل تعديل سجل النشاط أو حذفه.

راجع القواعد واختبرها في Firebase Emulator أو Rules Playground قبل نشرها على قاعدة بيانات فيها بيانات مهمة. هذه القواعد لا تنشئ واجهة التسجيل أو الربط تلقائياً؛ يلزم بعد إدخال Firebase config دمج SDK في صفحة الموقع واختبار تدفق التسجيل والانضمام والموافقة.

## مهم
لا ترسل:
- كلمة مرور حساب Google أو Firebase.
- Service Account JSON.
- مفتاح Admin SDK أو أي private key.
أرسل فقط Firebase Web config من إعدادات تطبيق الويب.
